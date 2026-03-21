import { useState, useEffect } from 'react';
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
  Edit
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
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const pageSize = 20;
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
    staleTime: 30000, // 30 seconds
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
                          setLineItems([]);
                          setIsViewModalOpen(true);
                          loadLineItems(order.DocEntry);
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
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b bg-amber-50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold text-gray-900">
                  Purchase Order - {selectedOrder?.DocumentStatus === 'bost_Open' ? 'Open' : 'Closed'}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-0.5">
                  SAP B1 Document View
                </DialogDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-sm">
                  <span className="text-gray-500">No.</span>{' '}
                  <span className="font-bold text-lg">PO-{selectedOrder?.DocNum}</span>
                </div>
                {selectedOrder && getStatusBadge(selectedOrder.DocumentStatus)}
              </div>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="px-6 py-4 space-y-5">
              {/* SAP-style Header Fields Grid */}
              <div className="grid grid-cols-2 gap-x-12 gap-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">Vendor</span>
                    <span className="font-mono text-sm bg-gray-50 border px-2 py-1 rounded flex-1">{selectedOrder.CardCode}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">Name</span>
                    <span className="text-sm font-medium flex-1">{selectedOrder.CardName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">Contact Person</span>
                    <span className="text-sm flex-1">{selectedOrder.ContactPerson || '-'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">Vendor Ref. No.</span>
                    <span className="text-sm font-mono flex-1">{selectedOrder.NumAtCard || '-'}</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Posting Date</span>
                    <span className="text-sm font-mono flex-1">{formatDate(selectedOrder.DocDate)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Delivery Date</span>
                    <span className="text-sm font-mono flex-1">{selectedOrder.DocDueDate ? formatDate(selectedOrder.DocDueDate) : '-'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Document Date</span>
                    <span className="text-sm font-mono flex-1">{formatDate(selectedOrder.DocDate)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-28 shrink-0">Project</span>
                    <span className="text-sm font-mono flex-1">{selectedOrder.Project || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Line Items Table - SAP Grid Style */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    Contents ({loadingItems ? '...' : lineItems.length})
                  </span>
                </div>
                {loadingItems ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-sm text-gray-500">Loading line items from SAP...</span>
                  </div>
                ) : lineItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No line items found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 text-xs">
                          <TableHead className="w-8 text-center">#</TableHead>
                          <TableHead>Item No.</TableHead>
                          <TableHead className="min-w-[200px]">Item Description</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-center">Discount %</TableHead>
                          <TableHead className="text-center">Tax Code</TableHead>
                          <TableHead className="text-right">Total (LC)</TableHead>
                          <TableHead className="text-right">Open Qty</TableHead>
                          <TableHead>Whse</TableHead>
                          <TableHead className="text-center">UoM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item: any, idx: number) => (
                          <TableRow key={idx} className="text-xs hover:bg-blue-50/40">
                            <TableCell className="text-center text-gray-400">{item.LineNum}</TableCell>
                            <TableCell className="font-mono text-blue-700">{item.ItemCode || '-'}</TableCell>
                            <TableCell className="text-gray-800">{item.ItemDescription || item.Description || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{item.Quantity ?? 0}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(item.UnitPrice || item.Price || 0)}</TableCell>
                            <TableCell className="text-center font-mono">{item.DiscountPercent ?? 0}%</TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.TaxCode || item.VatGroup || '-'}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatCurrency(item.LineTotal || 0)}</TableCell>
                            <TableCell className="text-right font-mono">{item.RemainingOpenQuantity ?? item.OpenQuantity ?? '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{item.WarehouseCode || item.WhsCode || '-'}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{item.UoMCode || item.MeasureUnit || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Footer: Buyer, Owner, Remarks, Totals */}
              <div className="grid grid-cols-2 gap-x-12">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-20 shrink-0">Currency</span>
                    <span className="text-sm font-mono bg-gray-50 border px-2 py-1 rounded">{selectedOrder.doc_currency || 'INR'}</span>
                  </div>
                  {selectedOrder.comments && (
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">Remarks</span>
                      <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 p-2 rounded whitespace-pre-wrap max-h-20 overflow-y-auto">
                        {selectedOrder.comments}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Total Before Discount</span>
                    <span className="font-mono">{formatCurrency(selectedOrder.DocTotal - (selectedOrder.VatSum || 0))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Tax</span>
                    <span className="font-mono">{formatCurrency(selectedOrder.VatSum || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-semibold text-gray-800">Total Payment Due</span>
                    <span className="font-mono font-bold text-base">{formatCurrency(selectedOrder.DocTotal)}</span>
                  </div>
                </div>
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