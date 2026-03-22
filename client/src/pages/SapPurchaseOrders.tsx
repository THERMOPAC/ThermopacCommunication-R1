import { useState, useEffect } from 'react';
import { SapAuthGuard } from '@/components/sap/SapAuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
  Edit,
  Loader2,
  RefreshCw,
  ClipboardCheck,
  Package,
  Truck,
  Shield,
  Paperclip,
  Upload,
  Trash2,
  FileText
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getGrpoQcChecklistConfig,
  getDefaultQcPayload,
  validateGrpoQcPayload,
  getFieldsByGroup,
  type QcFieldConfig,
  type QcGroupName,
} from '@shared/grpo-qc-config';

interface PurchaseOrder {
  DocNum: string;
  DocDate: string;
  CardName: string;
  DocTotal: number;
  DocumentStatus: string;
  DocEntry: number;
}

interface PurchaseOrdersData {
  orders: PurchaseOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

function PurchaseOrdersContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDocEntry, setSelectedDocEntry] = useState<number | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [activeTab, setActiveTab] = useState('contents');
  const [isGrpoDialogOpen, setIsGrpoDialogOpen] = useState(false);
  const [grpoLines, setGrpoLines] = useState<Array<{ lineNum: number; itemCode: string; itemDescription: string; quantity: number; openQty: number; quantityToReceive: number; warehouseCode: string; selected: boolean }>>([]);
  const [grpoPostingDate, setGrpoPostingDate] = useState(new Date().toISOString().split('T')[0]);
  const [grpoRemarks, setGrpoRemarks] = useState('');
  const [grpoSubmitting, setGrpoSubmitting] = useState(false);
  const [grpoJsonPreview, setGrpoJsonPreview] = useState<string | null>(null);
  const [grpoActiveTab, setGrpoActiveTab] = useState<string>('lines');
  const [qcValues, setQcValues] = useState<Record<string, string>>(getDefaultQcPayload());
  const [qcErrors, setQcErrors] = useState<Record<string, string>>({});
  const [grpoAttachments, setGrpoAttachments] = useState<File[]>([]);
  const pageSize = 50;
  const { toast } = useToast();

  const { data: seriesData } = useQuery<{ success: boolean; data: Array<{ Series: number; SeriesName: string }> }>({
    queryKey: ['/api/sap/b1/purchase/orders/series'],
    queryFn: async () => {
      const resp = await fetch('/api/sap/b1/purchase/orders/series', { credentials: 'include' });
      if (!resp.ok) return { success: false, data: [] };
      return resp.json();
    },
    staleTime: 1000 * 60 * 30,
  });
  const seriesList = seriesData?.data || [];
  const seriesMap = Object.fromEntries(seriesList.map(s => [s.Series, s.SeriesName]));

  // Debounce search to prevent too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, seriesFilter]);

  const queryParams = {
    page: currentPage, 
    limit: pageSize,
    ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(seriesFilter !== 'all' && { series: seriesFilter })
  };



  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; data: PurchaseOrdersData }>({
    queryKey: ['/api/sap/b1/purchase/orders', queryParams],
    queryFn: async () => {
      // Construct URL with query parameters
      const searchParams = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
      
      const url = `/api/sap/b1/purchase/orders?${searchParams.toString()}`;
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'SAP_SERVICE_UNAVAILABLE' || response.status === 502) {
          return { success: false, sapUnavailable: true, error: errorData.error || 'SAP Service Layer is currently unavailable' };
        }
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    enabled: true,
    staleTime: 30000,
  });

  const { data: poDetailData, isLoading: poDetailLoading } = useQuery<{ success: boolean; data: any }>({
    queryKey: ['/api/sap/b1/purchase/orders', selectedDocEntry],
    queryFn: async () => {
      const resp = await fetch(`/api/sap/b1/purchase/orders/${selectedDocEntry}`, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
      return resp.json();
    },
    enabled: selectedDocEntry !== null,
  });

  const poDetail = poDetailData?.data;

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
      case 'bost_Cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const openGrpoDialog = () => {
    if (!poDetail) return;
    const poIsOpen = poDetail.DocumentStatus === 'bost_Open' || poDetail.DocumentStatus === 'O';
    const lines = (poDetail.DocumentLines || [])
      .filter((l: any) => {
        if (l.LineStatus !== 'bost_Close' && l.LineStatus !== 'C') return true;
        if (poIsOpen) return true;
        return false;
      })
      .map((l: any) => {
        const rawOpen = parseFloat(l.RemainingOpenQuantity ?? l.OpenQuantity ?? 0);
        const qty = parseFloat(l.Quantity || 0);
        const lineTotal = parseFloat(l.LineTotal || l.Price || l.UnitPrice || 0);
        const isServiceLine = qty === 0 && lineTotal > 0;
        const effectiveQty = isServiceLine ? 1 : qty;
        const openQty = rawOpen > 0 ? rawOpen : (effectiveQty > 0 ? effectiveQty : 0);
        return {
          lineNum: l.LineNum,
          itemCode: l.ItemCode || l.ItemNo || '',
          itemDescription: l.ItemDescription || l.Dscription || l.FreeTxt || '',
          quantity: effectiveQty,
          openQty,
          quantityToReceive: openQty,
          warehouseCode: l.WarehouseCode || l.WhsCode || '',
          unitPrice: lineTotal,
          selected: openQty > 0,
        };
      })
      .filter((l: any) => l.openQty > 0);

    if (lines.length === 0) {
      toast({ title: 'No open lines', description: 'All lines in this PO are fully received or closed.', variant: 'destructive' });
      return;
    }
    setGrpoLines(lines);
    setGrpoPostingDate(new Date().toISOString().split('T')[0]);
    setGrpoRemarks('');
    setGrpoJsonPreview(null);
    setGrpoActiveTab('lines');
    setQcValues(getDefaultQcPayload());
    setQcErrors({});
    setGrpoAttachments([]);
    setIsGrpoDialogOpen(true);
  };

  const buildGrpoSapJson = () => {
    const selected = grpoLines.filter(l => l.selected && l.quantityToReceive > 0);
    const docEntry = poDetail?.DocEntry || selectedOrder?.DocEntry;
    const sapGrpoPayload: Record<string, any> = {
      CardCode: poDetail?.CardCode || selectedOrder?.CardCode,
      DocDate: grpoPostingDate,
      DocDueDate: grpoPostingDate,
      Comments: grpoRemarks || `Goods Receipt against PO ${poDetail?.DocNum || selectedOrder?.DocNum}`,
      ...qcValues,
      DocumentLines: selected.map(l => ({
        Quantity: l.quantityToReceive,
        WarehouseCode: l.warehouseCode,
        BaseType: 22,
        BaseEntry: docEntry,
        BaseLine: l.lineNum,
      })),
    };
    return sapGrpoPayload;
  };

  const handleGrpoSubmit = async () => {
    const selected = grpoLines.filter(l => l.selected && l.quantityToReceive > 0);
    if (selected.length === 0) {
      toast({ title: 'No lines selected', description: 'Please select at least one line to receive.', variant: 'destructive' });
      return;
    }
    for (const line of selected) {
      if (line.quantityToReceive > line.openQty) {
        toast({ title: 'Quantity exceeds open qty', description: `Line ${line.lineNum} (${line.itemCode}): receiving ${line.quantityToReceive} but only ${line.openQty} open.`, variant: 'destructive' });
        return;
      }
    }
    const qcResult = validateGrpoQcPayload(qcValues);
    if (!qcResult.canPost) {
      const errorMap: Record<string, string> = {};
      qcResult.errors.forEach(e => { errorMap[e.field] = e.message; });
      setQcErrors(errorMap);
      setGrpoActiveTab('qc');
      toast({ title: 'QC Checklist — Posting Blocked', description: `${qcResult.errors.length} QC rejection(s) found. Resolve before posting.`, variant: 'destructive' });
      return;
    }
    setQcErrors({});
    if (qcResult.warnings.length > 0) {
      const warnMsg = qcResult.warnings.map(w => w.message).join('; ');
      toast({ title: 'QC Checklist — Warnings', description: warnMsg });
    }
    setGrpoSubmitting(true);
    try {
      let attachmentEntry: number | undefined;

      if (grpoAttachments.length > 0) {
        const formData = new FormData();
        grpoAttachments.forEach(file => formData.append('files', file));
        const attachResp = await fetch('/api/sap/b1/purchase/attachments/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const attachResult = await attachResp.json();
        if (attachResp.ok && attachResult.success) {
          attachmentEntry = attachResult.attachmentEntry;
          console.log(`[GRPO] Attachments uploaded — AbsoluteEntry: ${attachmentEntry}`);
        } else {
          toast({ title: 'Attachment Upload Failed', description: attachResult.error || 'Failed to upload attachments to SAP', variant: 'destructive' });
          setGrpoSubmitting(false);
          return;
        }
      }

      const payload: any = {
        poDocEntry: poDetail?.DocEntry || selectedOrder?.DocEntry,
        postingDate: grpoPostingDate,
        remarks: grpoRemarks,
        headerUdfs: qcValues,
        selectedLines: selected.map(l => ({
          lineNum: l.lineNum,
          quantityToReceive: l.quantityToReceive,
          warehouseCode: l.warehouseCode,
        })),
      };
      if (attachmentEntry !== undefined) {
        payload.AttachmentEntry = attachmentEntry;
      }
      console.log('[GRPO] JSON Payload being sent to SAP:', JSON.stringify(payload, null, 2));
      const resp = await fetch('/api/sap/b1/purchase/grpo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      if (resp.ok && result.success) {
        toast({ title: 'GRPO Created', description: `GRPO Doc# ${result.grpoDocNum || result.docNum || ''} created successfully.` });
        setIsGrpoDialogOpen(false);
        setIsDetailModalOpen(false);
      } else {
        toast({ title: 'GRPO Failed', description: result.error || 'Failed to create GRPO', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error creating GRPO', variant: 'destructive' });
    } finally {
      setGrpoSubmitting(false);
    }
  };

  const loadLineItems = async (docEntry: number) => {
    setLoadingItems(true);
    try {
      const response = await fetch(`/api/sap/b1/purchase/orders/${docEntry}/items`);
      const result = await response.json();
      
      if (result.success) {
        setLineItems(result.data.items || []);
      } else {
        console.error('Failed to load line items:', result.error);
        setLineItems([]);
      }
    } catch (error) {
      console.error('Error loading line items:', error);
      setLineItems([]);
    } finally {
      setLoadingItems(false);
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
    const isSapUnavailable = (data as any)?.sapUnavailable || 
      (error instanceof Error && (error.message.includes('502') || error.message.includes('unavailable')));
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertTriangle className={`h-12 w-12 mx-auto ${isSapUnavailable ? 'text-amber-500' : 'text-red-600'}`} />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isSapUnavailable ? 'SAP Service Layer Unavailable' : 'Failed to Load Purchase Orders'}
            </h3>
            <p className="text-sm text-gray-600">
              {isSapUnavailable 
                ? 'Cannot connect to SAP B1 Service Layer. The service may be temporarily down or unreachable.'
                : (error instanceof Error ? error.message : 'Unable to fetch purchase orders')}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const ordersData = data.data;
  const totalPages = Math.ceil(ordersData.pagination.total / pageSize);

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by PO number or vendor name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
          {debouncedSearch && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Badge variant="secondary" className="text-xs">
                Searching...
              </Badge>
            </div>
          )}
        </div>
        <Select value={seriesFilter} onValueChange={(val) => setSeriesFilter(val)}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by series" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Series</SelectItem>
            {seriesList.map(s => (
              <SelectItem key={s.Series} value={String(s.Series)}>{s.SeriesName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="bost_Open">Open</SelectItem>
            <SelectItem value="bost_Close">Closed</SelectItem>
            <SelectItem value="bost_Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Display */}
      {(debouncedSearch || statusFilter !== 'all' || seriesFilter !== 'all') && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Active filters:</span>
          {debouncedSearch && (
            <Badge variant="outline" className="flex items-center gap-1">
              Search: "{debouncedSearch}"
              <button
                onClick={() => setSearchTerm('')}
                className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                title="Clear search"
              >
                ✕
              </button>
            </Badge>
          )}
          {seriesFilter !== 'all' && (
            <Badge variant="outline" className="flex items-center gap-1">
              Series: {seriesMap[Number(seriesFilter)] || seriesFilter}
              <button
                onClick={() => setSeriesFilter('all')}
                className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                title="Clear series filter"
              >
                ✕
              </button>
            </Badge>
          )}
          {statusFilter !== 'all' && (
            <Badge variant="outline" className="flex items-center gap-1">
              Status: {statusFilter.replace('bost_', '')}
              <button
                onClick={() => setStatusFilter('all')}
                className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                title="Clear status filter"
              >
                ✕
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Purchase Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Purchase Orders ({ordersData.pagination.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Series</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {ordersData.orders.map((order) => (
                <TableRow key={order.DocEntry}>
                  <TableCell className="text-xs font-mono text-gray-600">
                    {seriesMap[order.Series] || order.Series || '-'}
                  </TableCell>
                  <TableCell className="font-medium">
                    PO-{order.DocNum}
                  </TableCell>
                  <TableCell>
                    {formatDate(order.DocDate)}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate" title={order.CardName}>
                      {order.CardName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(order.DocTotal)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(order.DocumentStatus)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="View Purchase Order"
                        onClick={() => {
                          setSelectedOrder(order);
                          setSelectedDocEntry(order.DocEntry);
                          setActiveTab('contents');
                          setIsViewModalOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="Edit Purchase Order"
                        onClick={() => {
                          setSelectedOrder(order);
                          setEditFormData({
                            DocNum: order.DocNum,
                            CardCode: (order as any).CardCode || '',
                            CardName: (order as any).CardName || '',
                            DocDate: order.DocDate?.split('T')[0], // Format date for input
                            DocDueDate: (order as any).DocDueDate?.split('T')[0] || '',
                            Comments: (order as any).Comments || '',
                            DocumentStatus: order.DocumentStatus
                          });
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="Download Purchase Order"
                        onClick={() => {
                          // Generate and download PDF
                          const downloadPO = () => {
                            // Create content for download
                            const content = `
Purchase Order Document
======================
PO Number: ${order.DocNum}
Doc Entry: ${order.DocEntry}
Order Date: ${new Date(order.DocDate).toLocaleDateString()}
Status: ${order.DocumentStatus}
Vendor Code: ${(order as any).CardCode || 'N/A'}
Vendor Name: ${(order as any).CardName || 'N/A'}
Total Amount: ₹${order.DocTotal?.toLocaleString() || 'N/A'}
VAT Sum: ₹${order.VatSum?.toLocaleString() || 'N/A'}
Comments: ${(order as any).Comments || 'No comments'}

Generated on: ${new Date().toLocaleString()}
Generated by: THERMOPAC Purchase Order System
                            `;
                            
                            // Create and download as text file
                            const blob = new Blob([content], { type: 'text/plain' });
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `PO-${order.DocNum}_${order.DocEntry}.txt`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                            
                            toast({
                              title: "Purchase Order Downloaded",
                              description: `PO-${order.DocNum} has been downloaded successfully`,
                            });
                          };
                          
                          downloadPO();
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>

          {ordersData.orders.length === 0 && (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Purchase Orders Found</h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search criteria'
                  : 'No purchase orders available'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, ordersData.pagination.total)} of {ordersData.pagination.total} orders
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

      {/* View Purchase Order Modal - SAP Style */}
      <Dialog open={isViewModalOpen} onOpenChange={(open) => { setIsViewModalOpen(open); if (!open) setSelectedDocEntry(null); }}>
        <DialogContent className="max-w-[98vw] w-[1400px] max-h-[96vh] h-[96vh] overflow-hidden p-0 gap-0 flex flex-col">
          <DialogDescription className="sr-only">Purchase Order Detail from SAP B1</DialogDescription>
          {/* SAP Yellow Title Bar */}
          <div className="bg-amber-400 px-4 py-1 flex items-center justify-between shrink-0">
            <DialogTitle className="text-sm font-bold text-gray-900">
              Purchase Order - {poDetail?.DocumentStatus === 'bost_Open' && poDetail?.Cancelled === 'tNO' ? 'Open' : poDetail?.DocumentStatus === 'bost_Close' ? 'Closed' : poDetail?.Cancelled === 'tYES' ? 'Cancelled' : 'Open'}
            </DialogTitle>
            <span className="text-[12px] font-mono text-gray-700">DocEntry: {poDetail?.DocEntry || selectedOrder?.DocEntry}</span>
          </div>

          {poDetailLoading ? (
            <div className="flex items-center justify-center py-20 flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-base text-gray-500">Loading from SAP...</span>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Header Fields - SAP Style - Compact */}
              <div className="px-4 pt-2 pb-1 shrink-0">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4">
                  {/* Left Column */}
                  <div className="space-y-0.5">
                    {[
                      ['Vendor', poDetail?.CardCode || selectedOrder?.CardCode || '-'],
                      ['Name', poDetail?.CardName || selectedOrder?.CardName || '-'],
                      ['Contact Person', poDetail?.ContactPersonCode || '-'],
                      ['Vendor Ref. No.', poDetail?.NumAtCard || '-'],
                      ['Local Currency', poDetail?.DocCurrency || 'INR'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center text-[13px]">
                        <span className="text-gray-600 w-24 shrink-0">{label}</span>
                        <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 flex-1 text-gray-900">{val}</span>
                      </div>
                    ))}
                  </div>
                  {/* Center: Status */}
                  <div className="flex flex-col items-center justify-start pt-1">
                    <span className={`inline-flex items-center px-3 py-0.5 rounded text-[13px] font-bold border ${
                      poDetail?.DocumentStatus === 'bost_Open' || poDetail?.Cancelled === 'tNO'
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-red-100 text-red-800 border-red-300'
                    }`}>
                      {poDetail?.DocumentStatus === 'bost_Open' ? 'Open' : poDetail?.DocumentStatus === 'bost_Close' ? 'Closed' : poDetail?.Cancelled === 'tYES' ? 'Cancelled' : 'Open'}
                    </span>
                  </div>
                  {/* Right Column */}
                  <div className="space-y-0.5">
                    <div className="flex items-center text-[13px]">
                      <span className="text-gray-600 w-28 shrink-0">No.</span>
                      <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 w-24 text-gray-900">{poDetail?.SeriesName || seriesMap[poDetail?.Series] || `Series ${poDetail?.Series}` || '-'}</span>
                      <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 w-20 font-bold text-gray-900 ml-1">{poDetail?.DocNum || selectedOrder?.DocNum}</span>
                      <span className="font-mono text-gray-500 ml-2 text-[12px]">- 0</span>
                    </div>
                    <div className="flex items-center text-[13px]">
                      <span className="text-gray-600 w-28 shrink-0">Status</span>
                      <span className={`font-mono bg-white border border-gray-300 px-1.5 py-0 flex-1 font-medium ${
                        poDetail?.Cancelled === 'tYES' ? 'text-red-700' : poDetail?.DocumentStatus === 'bost_Close' ? 'text-gray-700' : 'text-green-700'
                      }`}>{poDetail?.Cancelled === 'tYES' ? 'Cancelled' : poDetail?.DocumentStatus === 'bost_Open' ? 'Open' : 'Closed'}</span>
                    </div>
                    {[
                      ['Posting Date', formatDate(poDetail?.DocDate || selectedOrder?.DocDate)],
                      ['Delivery Date', formatDate(poDetail?.DocDueDate || '')],
                      ['Document Date', formatDate(poDetail?.TaxDate || poDetail?.DocDate || selectedOrder?.DocDate)],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center text-[13px]">
                        <span className="text-gray-600 w-28 shrink-0">{label}</span>
                        <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 flex-1">{val || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Ship From row */}
                <div className="flex items-center text-[13px] mt-0.5">
                  <span className="text-gray-600 w-24 shrink-0">Ship From</span>
                  <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 text-gray-900">{poDetail?.ShipToCode || poDetail?.CardName || '-'}</span>
                </div>
              </div>

              {/* SAP Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="px-0">
                <div className="border-b border-gray-300 px-4">
                  <TabsList className="h-7 bg-transparent p-0 gap-0 rounded-none">
                    {['Contents', 'Logistics', 'Accounting', 'Tax'].map(tab => (
                      <TabsTrigger
                        key={tab}
                        value={tab.toLowerCase()}
                        className="h-7 px-3 text-sm rounded-none border border-b-0 border-gray-300 data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-600 -mb-px data-[state=active]:border-b-white"
                      >
                        {tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* Contents Tab - Line Items */}
                <TabsContent value="contents" className="mt-0 px-0 flex-1 overflow-hidden">
                  <div className="overflow-x-auto overflow-y-auto border-b border-gray-200 flex-1" style={{ minHeight: '200px', maxHeight: 'calc(96vh - 380px)' }}>
                    <Table className="w-max" style={{ minWidth: '1600px' }}>
                      <TableHeader>
                        <TableRow className="bg-gray-100 text-[12px] uppercase tracking-wide sticky top-0 z-10">
                          <TableHead className="w-[40px] text-center py-1 px-1 bg-gray-100">#</TableHead>
                          <TableHead className="w-[120px] py-1 px-2 bg-gray-100">Item/Service Type</TableHead>
                          <TableHead className="w-[160px] py-1 px-2 bg-gray-100">Item No.</TableHead>
                          <TableHead className="w-[350px] py-1 px-2 bg-gray-100">Item Description</TableHead>
                          <TableHead className="w-[80px] text-right py-1 px-2 bg-gray-100">Quantity</TableHead>
                          <TableHead className="w-[100px] text-right py-1 px-2 bg-gray-100">Inventory Qty</TableHead>
                          <TableHead className="w-[120px] text-right py-1 px-2 bg-gray-100">Unit Price</TableHead>
                          <TableHead className="w-[80px] text-center py-1 px-2 bg-gray-100">Discount %</TableHead>
                          <TableHead className="w-[90px] py-1 px-2 bg-gray-100">Tax Code</TableHead>
                          <TableHead className="w-[120px] text-right py-1 px-2 bg-gray-100">Total (LC)</TableHead>
                          <TableHead className="w-[80px] py-1 px-2 bg-gray-100">Whse</TableHead>
                          <TableHead className="w-[80px] py-1 px-2 bg-gray-100">UoM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(poDetail?.DocumentLines || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-gray-400 text-sm">No line items found</TableCell>
                          </TableRow>
                        ) : (
                          (poDetail?.DocumentLines || []).map((item: any, idx: number) => {
                            const itemType = item.LineType === 'lt_Item' || item.ItemType === 'it_Items' ? 'Item' 
                              : item.LineType === 'lt_Service' || item.ItemType === 'it_Services' ? 'Service'
                              : item.ItemCode ? 'Item' : 'Service';
                            return (
                            <TableRow key={idx} className="text-[13px] hover:bg-blue-50/50 border-b border-gray-100">
                              <TableCell className="text-center text-gray-400 py-1 px-1">{item.LineNum}</TableCell>
                              <TableCell className="py-1 px-2 text-gray-600">{itemType}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-blue-800">{item.ItemCode || item.ItemNo || '-'}</TableCell>
                              <TableCell className="py-1 px-2 text-gray-900">{item.ItemDescription || item.Dscription || item.FreeTxt || '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono">{item.Quantity ?? 0}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-gray-500">{item.InventoryQuantity ?? item.InvntryUom ?? '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono">{formatCurrency(item.UnitPrice || item.Price || item.PriceAfterVAT || 0)}</TableCell>
                              <TableCell className="text-center py-1 px-2 font-mono">{item.DiscountPercent ?? 0}%</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-sm">{item.TaxCode || item.VatGroup || '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono font-medium">{formatCurrency(item.LineTotal || 0)}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-sm">{item.WarehouseCode || item.WhsCode || '-'}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-sm">{item.UoMCode || item.MeasureUnit || item.UomCode || '-'}</TableCell>
                            </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Logistics Tab */}
                <TabsContent value="logistics" className="mt-0 px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {[
                      ['Ship To', poDetail?.ShipToCode || '-'],
                      ['Pay To', poDetail?.PayToCode || '-'],
                      ['Ship To Address', poDetail?.Address2 || '-'],
                      ['Pay To Address', poDetail?.Address || '-'],
                      ['Shipping Type', poDetail?.TransportationCode ? `Code: ${poDetail.TransportationCode}` : '-'],
                      ['Tracking No.', poDetail?.TrackingNumber || '-'],
                      ['Pick & Pack Remarks', poDetail?.PickRemark || '-'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-start">
                        <span className="text-gray-600 w-32 shrink-0 font-medium">{label}</span>
                        <span className="font-mono text-gray-900">{val}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Accounting Tab */}
                <TabsContent value="accounting" className="mt-0 px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {[
                      ['Journal Remark', poDetail?.JournalMemo || '-'],
                      ['Payment Terms', poDetail?.PaymentGroupCode !== undefined ? `Group ${poDetail.PaymentGroupCode}` : '-'],
                      ['Payment Method', poDetail?.PaymentMethod || '-'],
                      ['Central Bank Ind.', poDetail?.CentralBankIndicator || '-'],
                      ['Project', poDetail?.Project || '-'],
                      ['BP Channel Code', poDetail?.BPChannelCode || '-'],
                      ['Blanket Agreement', poDetail?.BlanketAgreementNumber ? `#${poDetail.BlanketAgreementNumber}` : '-'],
                      ['Federal Tax ID', poDetail?.FederalTaxID || '-'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-start">
                        <span className="text-gray-600 w-32 shrink-0 font-medium">{label}</span>
                        <span className="font-mono text-gray-900">{val}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Tax Tab */}
                <TabsContent value="tax" className="mt-0 px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {[
                      ['Tax Date', formatDate(poDetail?.TaxDate) || '-'],
                      ['Tax Total', formatCurrency(poDetail?.VatSum || 0)],
                      ['GSTIN', poDetail?.FederalTaxID || '-'],
                      ['CST Number', poDetail?.CSTNumber || '-'],
                      ['Excise Sum', formatCurrency(poDetail?.ExcisumSys || 0)],
                      ['Rounding Diff.', formatCurrency(poDetail?.RoundingDiffAmount || 0)],
                      ['WT Applied', poDetail?.WTApplied || '-'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-start">
                        <span className="text-gray-600 w-32 shrink-0 font-medium">{label}</span>
                        <span className="font-mono text-gray-900">{val}</span>
                      </div>
                    ))}
                    {/* Tax breakdown per line */}
                    {(poDetail?.DocumentLines || []).some((l: any) => l.TaxCode) && (
                      <div className="col-span-2 mt-2 border rounded overflow-hidden">
                        <div className="bg-gray-100 px-2 py-1 text-[12px] font-semibold text-gray-700">Line Tax Summary</div>
                        <Table>
                          <TableHeader>
                            <TableRow className="text-[12px] bg-gray-50">
                              <TableHead className="py-1 px-2">Item</TableHead>
                              <TableHead className="py-1 px-2">Tax Code</TableHead>
                              <TableHead className="text-right py-1 px-2">Taxable</TableHead>
                              <TableHead className="text-right py-1 px-2">Tax Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(poDetail?.DocumentLines || []).filter((l: any) => l.TaxCode).map((item: any, idx: number) => (
                              <TableRow key={idx} className="text-[13px]">
                                <TableCell className="py-1 px-2 font-mono">{item.ItemCode || '-'}</TableCell>
                                <TableCell className="py-1 px-2 font-mono">{item.TaxCode}</TableCell>
                                <TableCell className="text-right py-1 px-2 font-mono">{formatCurrency(item.LineTotal || 0)}</TableCell>
                                <TableCell className="text-right py-1 px-2 font-mono">{formatCurrency(item.TaxTotal || item.VatSum || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Bottom Section - Buyer, Owner, Totals, Remarks */}
              <div className="px-4 py-1.5 border-t border-gray-200 shrink-0">
                <div className="grid grid-cols-[1fr_1fr] gap-x-6">
                  {/* Left: Buyer, Owner, Remarks */}
                  <div className="space-y-0.5">
                    <div className="flex items-center text-[13px]">
                      <span className="text-gray-600 w-16 shrink-0">Buyer</span>
                      <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 flex-1">{poDetail?.SalesPersonCode ? `Purchase Officer ${poDetail.SalesPersonCode}` : '-'}</span>
                    </div>
                    <div className="flex items-center text-[13px]">
                      <span className="text-gray-600 w-16 shrink-0">Owner</span>
                      <span className="font-mono bg-white border border-gray-300 px-1.5 py-0 flex-1">{poDetail?.DocumentsOwner || '-'}</span>
                    </div>
                    {(poDetail?.Comments || selectedOrder?.Comments) && (
                      <div className="mt-0.5">
                        <span className="text-[12px] text-gray-500 block">Remarks</span>
                        <div className="text-[12px] text-gray-800 bg-amber-50 border border-amber-200 p-1.5 rounded whitespace-pre-wrap max-h-12 overflow-y-auto font-mono">
                          {poDetail?.Comments || selectedOrder?.Comments}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Right: Totals */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Before Discount</span>
                      <span className="font-mono font-medium">{formatCurrency(
                        (poDetail?.DocumentLines || []).reduce((sum: number, l: any) => sum + parseFloat(l.LineTotal || l.LineTotalSys || 0), 0)
                        || poDetail?.DocTotal || selectedOrder?.DocTotal || 0
                      )}</span>
                    </div>
                    {(poDetail?.DiscountPercent || 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Discount</span>
                        <span className="font-mono text-red-600">-{poDetail?.DiscountPercent}%</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Freight</span>
                      <span className="font-mono">{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Tax</span>
                      <span className="font-mono">{formatCurrency(poDetail?.VatSum || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-gray-300 pt-1 mt-1">
                      <span className="font-semibold text-gray-900">Total Payment Due</span>
                      <span className="font-mono font-bold text-base">{formatCurrency(poDetail?.DocTotal || selectedOrder?.DocTotal || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {(poDetail?.DocumentStatus !== 'bost_Close' && poDetail?.DocumentStatus !== 'C' && poDetail?.Cancelled !== 'tYES' && poDetail?.Cancelled !== 'Y') && (() => {
                const isServicePO = (poDetail?.DocumentLines || []).length > 0 && (poDetail?.DocumentLines || []).every((l: any) => !l.ItemCode && parseFloat(l.Quantity || 0) === 0 && parseFloat(l.LineTotal || 0) > 0);
                return !isServicePO;
              })() && (
                <div className="px-4 py-2 border-t border-gray-200 flex justify-end shrink-0">
                  <Button
                    onClick={openGrpoDialog}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PO to GRPO
                  </Button>
                </div>
              )}

              {/* SAP Status Bar */}
              <div className="bg-gray-100 border-t px-4 py-0.5 flex items-center justify-between text-[12px] text-gray-500 shrink-0">
                <span>{formatCurrency(poDetail?.DocTotal || selectedOrder?.DocTotal || 0)} [{poDetail?.DocCurrency || 'INR'}] DocEntry: {poDetail?.DocEntry || selectedOrder?.DocEntry}</span>
                <span className="font-mono">{new Date().toLocaleDateString('en-IN')} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* GRPO Creation Dialog */}
      <Dialog open={isGrpoDialogOpen} onOpenChange={setIsGrpoDialogOpen}>
        <DialogContent className="max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-lg">
              Create GRPO from PO-{poDetail?.DocNum || selectedOrder?.DocNum}
            </DialogTitle>
            <DialogDescription>
              {poDetail?.CardName || selectedOrder?.CardName} — Select lines and quantities to receive
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mb-3 shrink-0">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">Posting Date</Label>
              <Input
                type="date"
                value={grpoPostingDate}
                onChange={e => setGrpoPostingDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-[2]">
              <Label className="text-xs text-gray-500">Remarks</Label>
              <Input
                value={grpoRemarks}
                onChange={e => setGrpoRemarks(e.target.value)}
                placeholder="Optional remarks for GRPO"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Tabs value={grpoActiveTab} onValueChange={setGrpoActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="shrink-0 w-full justify-start">
              <TabsTrigger value="lines" className="text-xs gap-1.5 font-bold">
                <Package className="h-3.5 w-3.5" />
                Lines ({grpoLines.filter(l => l.selected).length}/{grpoLines.length})
              </TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs gap-1.5 font-bold">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments ({grpoAttachments.length})
              </TabsTrigger>
              <TabsTrigger value="qc" className="text-xs gap-1.5 font-bold">
                <ClipboardCheck className="h-3.5 w-3.5" />
                QC Checklist
                {(() => {
                  const tabResult = validateGrpoQcPayload(qcValues);
                  if (!tabResult.canPost) return <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{tabResult.errors.length}</Badge>;
                  if (tabResult.warnings.length > 0) return <Badge className="ml-1 h-4 px-1 text-[10px] bg-amber-500">{tabResult.warnings.length}</Badge>;
                  return <Badge className="ml-1 h-4 px-1 text-[10px] bg-green-600">✓</Badge>;
                })()}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="flex-1 overflow-auto mt-2">
              <div className="border rounded">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-10 text-center">
                        <input
                          type="checkbox"
                          checked={grpoLines.every(l => l.selected)}
                          onChange={e => setGrpoLines(prev => prev.map(l => ({ ...l, selected: e.target.checked })))}
                        />
                      </TableHead>
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs w-28">Item Code</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right w-20">PO Qty</TableHead>
                      <TableHead className="text-xs text-right w-20">Open Qty</TableHead>
                      <TableHead className="text-xs text-right w-28">Receive Qty</TableHead>
                      <TableHead className="text-xs w-20">Whse</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grpoLines.map((line, idx) => (
                      <TableRow key={line.lineNum} className={line.selected ? 'bg-green-50' : ''}>
                        <TableCell className="text-center py-1">
                          <input
                            type="checkbox"
                            checked={line.selected}
                            onChange={e => setGrpoLines(prev => prev.map((l, i) => i === idx ? { ...l, selected: e.target.checked } : l))}
                          />
                        </TableCell>
                        <TableCell className="text-xs py-1 font-mono">{line.lineNum}</TableCell>
                        <TableCell className="text-xs py-1 font-mono">{line.itemCode}</TableCell>
                        <TableCell className="text-xs py-1 truncate max-w-[250px]" title={line.itemDescription}>{line.itemDescription}</TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono">{line.quantity}</TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono">{line.openQty}</TableCell>
                        <TableCell className="text-xs py-1 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={line.openQty}
                            step="any"
                            value={line.quantityToReceive}
                            onChange={e => setGrpoLines(prev => prev.map((l, i) => i === idx ? { ...l, quantityToReceive: parseFloat(e.target.value) || 0 } : l))}
                            className="h-6 w-24 text-xs text-right font-mono ml-auto"
                            disabled={!line.selected}
                          />
                        </TableCell>
                        <TableCell className="text-xs py-1 font-mono">{line.warehouseCode}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="attachments" className="flex-1 overflow-auto mt-2">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('grpo-file-input')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length > 0) setGrpoAttachments(prev => [...prev, ...files]);
                  }}
                >
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, images, Excel, or any document</p>
                  <input
                    id="grpo-file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) setGrpoAttachments(prev => [...prev, ...files]);
                      e.target.value = '';
                    }}
                  />
                </div>

                {grpoAttachments.length > 0 && (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold w-8">#</TableHead>
                          <TableHead className="text-xs font-bold">Target Path</TableHead>
                          <TableHead className="text-xs font-bold">File Name</TableHead>
                          <TableHead className="text-xs font-bold">Attachment Date</TableHead>
                          <TableHead className="text-xs font-bold text-right">Size</TableHead>
                          <TableHead className="text-xs font-bold w-16 text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grpoAttachments.map((file, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs text-center">{idx + 1}</TableCell>
                            <TableCell className="text-xs text-gray-500">\\attachments\\</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                {file.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{new Date().toLocaleDateString('en-GB')}</TableCell>
                            <TableCell className="text-xs text-right text-gray-500">{(file.size / 1024).toFixed(1)} KB</TableCell>
                            <TableCell className="text-center">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setGrpoAttachments(prev => prev.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {grpoAttachments.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Paperclip className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No attachments added</p>
                    <p className="text-xs mt-1">Upload documents such as delivery challans, test certificates, or invoices</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="qc" className="flex-1 overflow-auto mt-2">
              <div className="space-y-4">
                {(() => {
                  const liveResult = validateGrpoQcPayload(qcValues);
                  if (!liveResult.canPost) return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">Posting Blocked — {liveResult.errors.length} QC rejection(s)</p>
                        <p className="text-xs text-red-600 mt-0.5">Rejected QC results must be resolved before GRPO can be posted.</p>
                      </div>
                    </div>
                  );
                  if (liveResult.warnings.length > 0) return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Posting Allowed — {liveResult.warnings.length} warning(s)</p>
                        <p className="text-xs text-amber-600 mt-0.5">{liveResult.warnings.map(w => w.message).join('; ')}</p>
                      </div>
                    </div>
                  );
                  return (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-green-600 shrink-0" />
                      <p className="text-sm font-medium text-green-800">QC Checklist complete — Ready to post</p>
                    </div>
                  );
                })()}
                {([
                  { group: 'supply' as QcGroupName, label: 'Supply', icon: <Package className="h-4 w-4 text-blue-600" /> },
                  { group: 'logistics' as QcGroupName, label: 'Logistics', icon: <Truck className="h-4 w-4 text-orange-600" /> },
                  { group: 'qc' as QcGroupName, label: 'Quality Control', icon: <Shield className="h-4 w-4 text-green-600" /> },
                ]).map(({ group, label, icon }) => {
                  const fields = getFieldsByGroup(group);
                  if (fields.length === 0) return null;
                  return (
                    <div key={group} className="border rounded-lg">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b rounded-t-lg">
                        {icon}
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {fields.map(field => {
                          const isQcGroup = field.groupName === 'qc';
                          const hasError = !!qcErrors[field.udfName];
                          const isWarning = !isQcGroup && qcValues[field.udfName] === 'F';
                          return (
                          <div key={field.udfName} className="space-y-1">
                            <Label className={`text-xs font-medium ${hasError ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-600'}`}>
                              {field.label}
                              {field.isMandatory && <span className="text-red-500 ml-0.5">*</span>}
                            </Label>
                            <Select
                              value={qcValues[field.udfName] || ''}
                              onValueChange={val => {
                                setQcValues(prev => ({ ...prev, [field.udfName]: val }));
                                if (qcErrors[field.udfName]) {
                                  setQcErrors(prev => { const n = { ...prev }; delete n[field.udfName]; return n; });
                                }
                              }}
                            >
                              <SelectTrigger className={`h-8 text-xs ${hasError ? 'border-red-400 bg-red-50' : isWarning ? 'border-amber-400 bg-amber-50' : ''}`}>
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                {field.values.map(opt => {
                                  const dotColor = opt.dataValue === 'Y' ? 'bg-green-500' : opt.dataValue === 'F' ? (isQcGroup ? 'bg-red-500' : 'bg-amber-500') : 'bg-gray-400';
                                  return (
                                  <SelectItem key={opt.dataValue} value={opt.dataValue} className="text-xs">
                                    <span className="flex items-center gap-1.5">
                                      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
                                      {opt.displayValue}
                                    </span>
                                  </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {hasError && (
                              <p className="text-[10px] text-red-500">{qcErrors[field.udfName]}</p>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          {grpoLines.filter(l => l.selected).length > 0 && (
            <div className="shrink-0 border-t pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">SAP GRPO JSON — POST /PurchaseDeliveryNotes</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    const json = JSON.stringify(buildGrpoSapJson(), null, 2);
                    navigator.clipboard.writeText(json);
                    toast({ title: 'Copied', description: 'JSON copied to clipboard' });
                  }}
                >
                  Copy JSON
                </Button>
              </div>
              <pre className="text-[10px] font-mono bg-gray-900 text-green-400 p-2 rounded overflow-auto max-h-[140px] whitespace-pre">
                {JSON.stringify(buildGrpoSapJson(), null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t shrink-0">
            <div className="text-sm text-gray-600">
              {grpoLines.filter(l => l.selected).length} of {grpoLines.length} lines selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsGrpoDialogOpen(false)} disabled={grpoSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleGrpoSubmit}
                disabled={grpoSubmitting || grpoLines.filter(l => l.selected).length === 0}
                className="bg-green-600 hover:bg-green-700 text-white px-6"
              >
                {grpoSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create GRPO'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Purchase Order Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Purchase Order - PO-{selectedOrder?.DocNum}
            </DialogTitle>
            <DialogDescription>
              Modify purchase order details and save changes
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              <form className="space-y-4">
                {/* Basic Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="docNum">PO Number</Label>
                    <Input
                      id="docNum"
                      value={editFormData.DocNum || ''}
                      readOnly
                      className="bg-gray-100"
                      placeholder="Auto-generated"
                    />
                    <p className="text-xs text-gray-500">Read-only system field</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="documentStatus">Status</Label>
                    <select
                      id="documentStatus"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editFormData.DocumentStatus || ''}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, DocumentStatus: e.target.value }))}
                    >
                      <option value="bost_Open">Open</option>
                      <option value="bost_Close">Closed</option>
                      <option value="bost_Delivered">Delivered</option>
                    </select>
                  </div>
                </div>

                {/* Vendor Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardCode">Vendor Code</Label>
                    <Input
                      id="cardCode"
                      value={editFormData.CardCode || ''}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, CardCode: e.target.value }))}
                      placeholder="Enter vendor code"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="cardName">Vendor Name</Label>
                    <Input
                      id="cardName"
                      value={editFormData.CardName || ''}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, CardName: e.target.value }))}
                      placeholder="Enter vendor name"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="docDate">Order Date</Label>
                    <Input
                      id="docDate"
                      type="date"
                      value={editFormData.DocDate || ''}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, DocDate: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="docDueDate">Due Date</Label>
                    <Input
                      id="docDueDate"
                      type="date"
                      value={editFormData.DocDueDate || ''}
                      onChange={(e) => setEditFormData((prev: any) => ({ ...prev, DocDueDate: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Comments */}
                <div className="space-y-2">
                  <Label htmlFor="comments">Comments</Label>
                  <textarea
                    id="comments"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    value={editFormData.Comments || ''}
                    onChange={(e) => setEditFormData((prev: any) => ({ ...prev, Comments: e.target.value }))}
                    placeholder="Add comments or notes for this purchase order"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      // TODO: Implement actual save functionality
                      toast({
                        title: "Purchase Order Updated",
                        description: `PO-${editFormData.DocNum} has been updated successfully`,
                      });
                      setIsEditModalOpen(false);
                    }}
                  >
                    Save Changes
                  </Button>
                </div>
              </form>

              {/* Warning Notice */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Development Note
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        This edit form is currently in development mode. Changes will show confirmation 
                        but won't be saved to SAP B1 until the backend integration is completed.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SapPurchaseOrders() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <p className="text-gray-600">Manage and track purchase orders from SAP B1</p>
      </div>
      
      <SapAuthGuard>
        <PurchaseOrdersContent />
      </SapAuthGuard>
    </div>
  );
}