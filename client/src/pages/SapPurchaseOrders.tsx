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
  Loader2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDocEntry, setSelectedDocEntry] = useState<number | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [activeTab, setActiveTab] = useState('contents');
  const pageSize = 50;
  const { toast } = useToast();

  // Debounce search to prevent too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset page when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  // Build query parameters, excluding undefined values
  const queryParams = {
    page: currentPage, 
    limit: pageSize,
    ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    ...(statusFilter !== 'all' && { status: statusFilter })
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
        throw new Error(`HTTP error! status: ${response.status}`);
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
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Failed to Load Purchase Orders</h3>
            <p className="text-sm text-gray-600">
              {error instanceof Error ? error.message : 'Unable to fetch purchase orders'}
            </p>
          </div>
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
      {(debouncedSearch || statusFilter !== 'all') && (
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
        <DialogContent className="max-w-[95vw] w-[1100px] max-h-[92vh] overflow-hidden p-0 gap-0">
          <DialogDescription className="sr-only">Purchase Order Detail from SAP B1</DialogDescription>
          {/* SAP Yellow Title Bar */}
          <div className="bg-amber-400 px-4 py-1.5 flex items-center justify-between">
            <DialogTitle className="text-sm font-bold text-gray-900">
              Purchase Order - {poDetail?.DocumentStatus === 'bost_Open' ? 'Split (Approved)' : poDetail?.DocumentStatus === 'bost_Close' ? 'Closed' : selectedOrder?.DocumentStatus === 'bost_Open' ? 'Open' : 'Closed'}
            </DialogTitle>
          </div>

          {poDetailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-gray-500">Loading from SAP...</span>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[calc(92vh-40px)]">
              {/* Header Fields - SAP Style */}
              <div className="px-4 pt-3 pb-2">
                <div className="grid grid-cols-[1fr_1fr] gap-x-8">
                  {/* Left Column */}
                  <div className="space-y-1.5">
                    {[
                      ['Vendor', poDetail?.CardCode || selectedOrder?.CardCode || '-'],
                      ['Name', poDetail?.CardName || selectedOrder?.CardName || '-'],
                      ['Contact Person', poDetail?.ContactPersonCode || '-'],
                      ['Vendor Ref. No.', poDetail?.NumAtCard || '-'],
                      ['Local Currency', poDetail?.DocCurrency || 'INR'],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center text-xs">
                        <span className="text-gray-600 w-28 shrink-0">{label}</span>
                        <span className="font-mono bg-white border border-gray-300 px-2 py-0.5 flex-1 text-gray-900">{val}</span>
                      </div>
                    ))}
                  </div>
                  {/* Right Column */}
                  <div className="space-y-1.5">
                    <div className="flex items-center text-xs">
                      <span className="text-gray-600 w-4 shrink-0">No.</span>
                      <span className="font-mono font-bold text-sm ml-1">{poDetail?.DocNum || selectedOrder?.DocNum}</span>
                    </div>
                    {[
                      ['Posting Date', formatDate(poDetail?.DocDate || selectedOrder?.DocDate)],
                      ['Delivery Date', formatDate(poDetail?.DocDueDate || '')],
                      ['Document Date', formatDate(poDetail?.TaxDate || poDetail?.DocDate || selectedOrder?.DocDate)],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex items-center text-xs">
                        <span className="text-gray-600 w-28 shrink-0">{label}</span>
                        <span className="font-mono bg-white border border-gray-300 px-2 py-0.5 flex-1">{val || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Ship From row */}
                <div className="flex items-center text-xs mt-1.5">
                  <span className="text-gray-600 w-28 shrink-0">Ship From</span>
                  <span className="font-mono bg-white border border-gray-300 px-2 py-0.5 text-gray-900">{poDetail?.ShipToCode || poDetail?.CardName || '-'}</span>
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
                        className="h-7 px-3 text-xs rounded-none border border-b-0 border-gray-300 data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-600 -mb-px data-[state=active]:border-b-white"
                      >
                        {tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* Contents Tab - Line Items */}
                <TabsContent value="contents" className="mt-0 px-0">
                  <div className="overflow-x-auto border-b border-gray-200" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-100 text-[10px] uppercase tracking-wide sticky top-0 z-10">
                          <TableHead className="w-6 text-center py-1 px-1 bg-gray-100">#</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">Item/Service Type</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">Item No.</TableHead>
                          <TableHead className="py-1 px-2 min-w-[220px] bg-gray-100">Item Description</TableHead>
                          <TableHead className="text-right py-1 px-2 bg-gray-100">Quantity</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">Inventory Qty</TableHead>
                          <TableHead className="text-right py-1 px-2 bg-gray-100">Unit Price</TableHead>
                          <TableHead className="text-center py-1 px-2 bg-gray-100">Discount %</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">Tax Code</TableHead>
                          <TableHead className="text-right py-1 px-2 bg-gray-100">Total (LC)</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">Whse</TableHead>
                          <TableHead className="py-1 px-2 bg-gray-100">UoM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(poDetail?.DocumentLines || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-6 text-gray-400 text-xs">No line items found</TableCell>
                          </TableRow>
                        ) : (
                          (poDetail?.DocumentLines || []).map((item: any, idx: number) => {
                            const itemType = item.LineType === 'lt_Item' || item.ItemType === 'it_Items' ? 'Item' 
                              : item.LineType === 'lt_Service' || item.ItemType === 'it_Services' ? 'Service'
                              : item.ItemCode ? 'Item' : 'Service';
                            return (
                            <TableRow key={idx} className="text-[11px] hover:bg-blue-50/50 border-b border-gray-100">
                              <TableCell className="text-center text-gray-400 py-1 px-1">{item.LineNum}</TableCell>
                              <TableCell className="py-1 px-2 text-gray-600">{itemType}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-blue-800">{item.ItemCode || item.ItemNo || '-'}</TableCell>
                              <TableCell className="py-1 px-2 text-gray-900">{item.ItemDescription || item.Dscription || item.FreeTxt || '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono">{item.Quantity ?? 0}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-gray-500">{item.InventoryQuantity ?? item.InvntryUom ?? '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono">{formatCurrency(item.UnitPrice || item.Price || item.PriceAfterVAT || 0)}</TableCell>
                              <TableCell className="text-center py-1 px-2 font-mono">{item.DiscountPercent ?? 0}%</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-xs">{item.TaxCode || item.VatGroup || '-'}</TableCell>
                              <TableCell className="text-right py-1 px-2 font-mono font-medium">{formatCurrency(item.LineTotal || 0)}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-xs">{item.WarehouseCode || item.WhsCode || '-'}</TableCell>
                              <TableCell className="py-1 px-2 font-mono text-xs">{item.UoMCode || item.MeasureUnit || item.UomCode || '-'}</TableCell>
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
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
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
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
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
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
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
                        <div className="bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-700">Line Tax Summary</div>
                        <Table>
                          <TableHeader>
                            <TableRow className="text-[10px] bg-gray-50">
                              <TableHead className="py-1 px-2">Item</TableHead>
                              <TableHead className="py-1 px-2">Tax Code</TableHead>
                              <TableHead className="text-right py-1 px-2">Taxable</TableHead>
                              <TableHead className="text-right py-1 px-2">Tax Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(poDetail?.DocumentLines || []).filter((l: any) => l.TaxCode).map((item: any, idx: number) => (
                              <TableRow key={idx} className="text-[11px]">
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
              <div className="px-4 py-3 border-t border-gray-200">
                <div className="grid grid-cols-[1fr_1fr] gap-x-8">
                  {/* Left: Buyer, Owner, Remarks */}
                  <div className="space-y-1.5">
                    <div className="flex items-center text-xs">
                      <span className="text-gray-600 w-16 shrink-0">Buyer</span>
                      <span className="font-mono bg-white border border-gray-300 px-2 py-0.5 flex-1">{poDetail?.SalesPersonCode ? `Purchase Officer ${poDetail.SalesPersonCode}` : '-'}</span>
                    </div>
                    <div className="flex items-center text-xs">
                      <span className="text-gray-600 w-16 shrink-0">Owner</span>
                      <span className="font-mono bg-white border border-gray-300 px-2 py-0.5 flex-1">{poDetail?.DocumentsOwner || '-'}</span>
                    </div>
                    {(poDetail?.Comments || selectedOrder?.Comments) && (
                      <div className="mt-1">
                        <span className="text-[10px] text-gray-500 block mb-0.5">Remarks</span>
                        <div className="text-[11px] text-gray-800 bg-amber-50 border border-amber-200 p-2 rounded whitespace-pre-wrap max-h-16 overflow-y-auto font-mono">
                          {poDetail?.Comments || selectedOrder?.Comments}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Right: Totals */}
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Before Discount</span>
                      <span className="font-mono font-medium">{formatCurrency(poDetail?.DocTotalSys || poDetail?.DocTotal || selectedOrder?.DocTotal || 0)}</span>
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
                      <span className="font-mono font-bold text-sm">{formatCurrency(poDetail?.DocTotal || selectedOrder?.DocTotal || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SAP Status Bar */}
              <div className="bg-gray-100 border-t px-4 py-1 flex items-center justify-between text-[10px] text-gray-500">
                <span>{formatCurrency(poDetail?.DocTotal || selectedOrder?.DocTotal || 0)} [{poDetail?.DocCurrency || 'INR'}] DocEntry: {poDetail?.DocEntry || selectedOrder?.DocEntry}</span>
                <span className="font-mono">{new Date().toLocaleDateString('en-IN')} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )}
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