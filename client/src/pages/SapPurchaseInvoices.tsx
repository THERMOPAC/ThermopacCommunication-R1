import { useState } from 'react';
import { SapAuthGuard } from '@/components/sap/SapAuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Filter,
  Receipt, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
  Loader2,
  Package,
  X
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface PurchaseInvoice {
  DocNum: string;
  DocDate: string;
  CardName: string;
  DocTotal: number;
  DocumentStatus: string;
  DocEntry: number;
}

interface PurchaseInvoicesData {
  invoices: PurchaseInvoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

interface InvoiceLine {
  LineNum: number;
  ItemCode: string;
  ItemDescription: string;
  Quantity: number;
  UnitPrice: number;
  LineTotal: number;
  WarehouseCode?: string;
  TaxCode?: string;
}

interface InvoiceDetail {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate: string;
  CardCode: string;
  CardName: string;
  DocTotal: number;
  DocCurrency: string;
  DocumentStatus: string;
  Comments?: string;
  NumAtCard?: string;
  DocumentLines: InvoiceLine[];
}

function PurchaseInvoicesContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDocEntry, setSelectedDocEntry] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState<number | null>(null);
  const pageSize = 20;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ success: boolean; data: PurchaseInvoicesData }>({
    queryKey: ['/api/sap/b1/purchase/invoices', { 
      page: currentPage, 
      limit: pageSize, 
      search: searchTerm,
      status: statusFilter 
    }],
    enabled: true,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ success: boolean; data: InvoiceDetail }>({
    queryKey: ['/api/sap/b1/purchase/invoices', selectedDocEntry],
    enabled: selectedDocEntry !== null,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bost_Open':
        return <Badge variant="default">Open</Badge>;
      case 'bost_Close':
        return <Badge variant="secondary">Closed</Badge>;
      case 'bost_Paid':
        return <Badge variant="default" className="bg-green-100 text-green-800">Paid</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleDownload = async (invoice: PurchaseInvoice) => {
    setIsDownloading(invoice.DocEntry);
    try {
      const resp = await fetch(`/api/sap/b1/purchase/invoices/${invoice.DocEntry}`, { credentials: 'include' });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch');

      const inv: InvoiceDetail = result.data;
      const lines = inv.DocumentLines || [];

      let csv = 'Invoice Number,Date,Due Date,Vendor Code,Vendor Name,Status,Vendor Ref\n';
      csv += `INV-${inv.DocNum},${inv.DocDate},${inv.DocDueDate || ''},${inv.CardCode},${inv.CardName},${inv.DocumentStatus},${inv.NumAtCard || ''}\n\n`;
      csv += 'Line,Item Code,Description,Qty,Unit Price,Line Total,Warehouse,Tax Code\n';
      lines.forEach((l: InvoiceLine) => {
        csv += `${l.LineNum},"${l.ItemCode || ''}","${l.ItemDescription || ''}",${l.Quantity},${l.UnitPrice},${l.LineTotal},${l.WarehouseCode || ''},${l.TaxCode || ''}\n`;
      });
      csv += `\n,,,,Total:,${inv.DocTotal},,\n`;

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_INV-${invoice.DocNum}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Downloaded', description: `Invoice INV-${invoice.DocNum} exported as CSV` });
    } catch (err: any) {
      toast({ title: 'Download Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsDownloading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="space-y-3 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Failed to Load Purchase Invoices</h3>
            <p className="text-sm text-gray-600">
              {error instanceof Error ? error.message : 'Unable to fetch purchase invoices'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const invoicesData = data.data;
  const totalPages = Math.ceil(invoicesData.pagination.total / pageSize);
  const invoiceDetail = detailData?.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by invoice number or vendor name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="bost_Open">Open</SelectItem>
            <SelectItem value="bost_Close">Closed</SelectItem>
            <SelectItem value="bost_Paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Purchase Invoices ({invoicesData.pagination.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesData.invoices.map((invoice) => (
                <TableRow key={invoice.DocEntry}>
                  <TableCell className="font-medium">
                    INV-{invoice.DocNum}
                  </TableCell>
                  <TableCell>
                    {formatDate(invoice.DocDate)}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate" title={invoice.CardName}>
                      {invoice.CardName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.DocTotal)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(invoice.DocumentStatus)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View invoice details"
                        onClick={() => setSelectedDocEntry(invoice.DocEntry)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Download as CSV"
                        onClick={() => handleDownload(invoice)}
                        disabled={isDownloading === invoice.DocEntry}
                      >
                        {isDownloading === invoice.DocEntry ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {invoicesData.invoices.length === 0 && (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Purchase Invoices Found</h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search criteria'
                  : 'No purchase invoices available'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, invoicesData.pagination.total)} of {invoicesData.pagination.total} invoices
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={selectedDocEntry !== null} onOpenChange={() => setSelectedDocEntry(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {invoiceDetail ? `Invoice INV-${invoiceDetail.DocNum}` : 'Invoice Details'}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Loading invoice from SAP...</span>
            </div>
          ) : invoiceDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Invoice No.</p>
                  <p className="font-semibold">INV-{invoiceDetail.DocNum}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Date</p>
                  <p className="font-medium">{formatDate(invoiceDetail.DocDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Due Date</p>
                  <p className="font-medium">{invoiceDetail.DocDueDate ? formatDate(invoiceDetail.DocDueDate) : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Status</p>
                  {getStatusBadge(invoiceDetail.DocumentStatus)}
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase">Vendor</p>
                  <p className="font-medium">{invoiceDetail.CardName}</p>
                  <p className="text-xs text-gray-500">{invoiceDetail.CardCode}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Vendor Ref</p>
                  <p className="font-medium">{invoiceDetail.NumAtCard || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Total</p>
                  <p className="font-bold text-lg">{formatCurrency(invoiceDetail.DocTotal)}</p>
                </div>
              </div>

              {invoiceDetail.Comments && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Remarks</p>
                  <p className="text-sm text-gray-700">{invoiceDetail.Comments}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Line Items ({invoiceDetail.DocumentLines?.length || 0})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invoiceDetail.DocumentLines || []).map((line: InvoiceLine) => (
                        <TableRow key={line.LineNum}>
                          <TableCell className="text-gray-500">{line.LineNum}</TableCell>
                          <TableCell className="font-mono text-xs">{line.ItemCode}</TableCell>
                          <TableCell>
                            <div className="max-w-64 truncate" title={line.ItemDescription}>
                              {line.ItemDescription}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{line.Quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.UnitPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(line.LineTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end mt-3">
                  <div className="bg-gray-50 px-4 py-2 rounded-lg">
                    <span className="text-sm text-gray-600 mr-3">Invoice Total:</span>
                    <span className="font-bold text-lg">{formatCurrency(invoiceDetail.DocTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Failed to load invoice details</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SapPurchaseInvoices() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Invoices</h1>
        <p className="text-gray-600">Manage and track purchase invoices from SAP B1</p>
      </div>
      
      <SapAuthGuard>
        <PurchaseInvoicesContent />
      </SapAuthGuard>
    </div>
  );
}
