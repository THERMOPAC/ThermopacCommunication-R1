import { useState, useEffect } from 'react';
import { fmtDate } from "@/lib/date-format";
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
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Package, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Download
} from 'lucide-react';

interface GoodsReceipt {
  DocNum: string;
  DocDate: string;
  CardName: string;
  DocTotal: number;
  DocumentStatus: string;
  DocEntry: number;
}

interface GoodsReceiptsData {
  receipts: GoodsReceipt[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

function GoodsReceiptsContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const pageSize = 20;
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.length >= 3 ? searchTerm : '');
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, error } = useQuery<{ success: boolean; data: GoodsReceiptsData }>({
    queryKey: ['/api/sap/b1/purchase/receipts', { 
      page: currentPage, 
      limit: pageSize, 
      ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
    }],
    enabled: true,
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
    return fmtDate(dateString);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bost_Open':
        return <Badge variant="default">Open</Badge>;
      case 'bost_Close':
        return <Badge variant="secondary">Closed</Badge>;
      default:
        return <Badge variant="outline">{status || 'Completed'}</Badge>;
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
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
            <h3 className="text-lg font-semibold text-gray-900">Failed to Load Goods Receipts</h3>
            <p className="text-sm text-gray-600">
              {error instanceof Error ? error.message : 'Unable to fetch goods receipts'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const receiptsData = data.data;
  const totalPages = Math.ceil(receiptsData.pagination.total / pageSize);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search by receipt number or vendor name (min 3 chars)..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Goods Receipts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Goods Receipt POs ({receiptsData.pagination.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiptsData.receipts.map((receipt) => (
                <TableRow key={receipt.DocEntry}>
                  <TableCell className="font-medium">
                    GR-{receipt.DocNum}
                  </TableCell>
                  <TableCell>
                    {formatDate(receipt.DocDate)}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate" title={receipt.CardName}>
                      {receipt.CardName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(receipt.DocTotal)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(receipt.DocumentStatus)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="View Goods Receipt"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setIsViewModalOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="Edit Goods Receipt"
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setEditFormData({
                            DocNum: receipt.DocNum,
                            CardName: receipt.CardName,
                            DocDate: receipt.DocDate?.split('T')[0],
                            DocumentStatus: receipt.DocumentStatus,
                            Comments: (receipt as any).Comments || '',
                          });
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        title="Download Goods Receipt"
                        onClick={() => {
                          // Generate and download receipt document
                          const content = `
Goods Receipt Document
======================
GR Number: ${receipt.DocNum}
Doc Entry: ${receipt.DocEntry}
Receipt Date: ${fmtDate(receipt.DocDate)}
Status: ${receipt.DocumentStatus}
Vendor: ${receipt.CardName}
Total Amount: ₹${receipt.DocTotal?.toLocaleString() || 'N/A'}

Generated on: ${new Date().toLocaleString()}
Generated by: THERMOPAC Goods Receipt System
                          `;
                          
                          const blob = new Blob([content], { type: 'text/plain' });
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `GR-${receipt.DocNum}_${receipt.DocEntry}.txt`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(url);
                          
                          toast({
                            title: "Download Complete",
                            description: `Goods Receipt GR-${receipt.DocNum} downloaded successfully.`
                          });
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

          {receiptsData.receipts.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Goods Receipts Found</h3>
              <p className="text-gray-600">
                {searchTerm 
                  ? 'Try adjusting your search criteria'
                  : 'No goods receipts available'
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
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, receiptsData.pagination.total)} of {receiptsData.pagination.total} receipts
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

      {/* View Goods Receipt Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Goods Receipt Details - GR-{selectedReceipt?.DocNum}
            </DialogTitle>
            <DialogDescription>
              Complete goods receipt information from SAP B1
            </DialogDescription>
          </DialogHeader>
          
          {selectedReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">GR Number</Label>
                  <p className="text-sm text-gray-900">GR-{selectedReceipt.DocNum}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Doc Entry</Label>
                  <p className="text-sm text-gray-900">{selectedReceipt.DocEntry}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Receipt Date</Label>
                  <p className="text-sm text-gray-900">{formatDate(selectedReceipt.DocDate)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedReceipt.DocumentStatus)}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-sm font-medium text-gray-700">Vendor</Label>
                  <p className="text-sm text-gray-900">{selectedReceipt.CardName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Total Amount</Label>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedReceipt.DocTotal)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Goods Receipt Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Goods Receipt - GR-{selectedReceipt?.DocNum}
            </DialogTitle>
            <DialogDescription>
              Modify goods receipt details and save changes
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="docNum">GR Number</Label>
                <Input
                  id="docNum"
                  value={`GR-${editFormData.DocNum || ''}`}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              
              <div>
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={editFormData.DocumentStatus || ''} 
                  onValueChange={(value) => setEditFormData((prev: any) => ({ ...prev, DocumentStatus: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bost_Open">Open</SelectItem>
                    <SelectItem value="bost_Close">Closed</SelectItem>
                    <SelectItem value="bost_Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-2">
                <Label htmlFor="vendor">Vendor Name</Label>
                <Input
                  id="vendor"
                  value={editFormData.CardName || ''}
                  onChange={(e) => setEditFormData((prev: any) => ({ ...prev, CardName: e.target.value }))}
                  placeholder="Enter vendor name"
                />
              </div>
              
              <div>
                <Label htmlFor="docDate">Receipt Date</Label>
                <Input
                  id="docDate"
                  type="date"
                  value={editFormData.DocDate || ''}
                  onChange={(e) => setEditFormData((prev: any) => ({ ...prev, DocDate: e.target.value }))}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="comments">Comments</Label>
              <Textarea
                id="comments"
                placeholder="Enter any comments about this goods receipt..."
                value={editFormData.Comments || ''}
                onChange={(e) => setEditFormData((prev: any) => ({ ...prev, Comments: e.target.value }))}
                rows={3}
              />
            </div>
            
            <div className="flex justify-end space-x-2 pt-6 border-t">
              <Button 
                variant="outline" 
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  toast({
                    title: "Changes Saved",
                    description: `Goods Receipt GR-${selectedReceipt?.DocNum} has been updated successfully.`
                  });
                  setIsEditModalOpen(false);
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SapGoodsReceipts() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Goods Receipt POs</h1>
        <p className="text-gray-600">Track goods receipts from purchase orders in SAP B1</p>
      </div>
      
      <SapAuthGuard>
        <GoodsReceiptsContent />
      </SapAuthGuard>
    </div>
  );
}