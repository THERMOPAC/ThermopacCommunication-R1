import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Plus, Loader2, AlertCircle, Search, Upload, Calendar, Building2, CheckCircle, Edit, Eye } from 'lucide-react';
import Layout from '@/components/layout';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatRupees } from '@/lib/utils';

interface BrcFormData {
  invoiceId: number;
  brcNumber: string;
  brcDate: string;
  bankName: string;
  amountRealized: number;
  currency: string;
  notes: string;
  file?: File;
}

export default function BrcManagementPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBrc, setEditingBrc] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BrcFormData>({
    invoiceId: 0,
    brcNumber: '',
    brcDate: format(new Date(), 'yyyy-MM-dd'),
    bankName: '',
    amountRealized: 0,
    currency: 'USD',
    notes: ''
  });

  // Fetch customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['/api/customers'],
    enabled: true
  });

  // Fetch all invoices
  const { data: invoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['/api/simple-finance/invoices-list'],
    enabled: true
  });

  // Fetch BRC records
  const { data: brcRecords, isLoading: isLoadingBrcs } = useQuery({
    queryKey: ['/api/finance/brc'],
    enabled: true
  });

  // Filter invoices based on selections and tab
  const filteredData = useMemo(() => {
    if (!invoices) return { pending: [], received: [], notRequired: [] };

    let filtered = invoices;
    
    // Filter by customer if specified
    if (selectedCustomerId && selectedCustomerId !== 'all') {
      filtered = filtered.filter((inv: any) => inv.customerId.toString() === selectedCustomerId);
    }

    // Filter by selected invoice if specified
    if (selectedInvoiceId && selectedInvoiceId !== 'all') {
      filtered = filtered.filter((inv: any) => inv.id.toString() === selectedInvoiceId);
    }

    // Filter based on BRC requirement rather than export status
    const brcRequiredInvoices = filtered.filter((inv: any) => inv.brcRequired === true);
    
    // Invoices that don't require BRC
    const notRequired = filtered.filter((inv: any) => inv.brcRequired === false);

    const pending = brcRequiredInvoices.filter((invoice: any) => {
      const hasBrc = brcRecords?.some((brc: any) => brc.related_invoice_id === invoice.id);
      return !hasBrc;
    });

    const received = brcRecords?.filter((brc: any) => {
      if (selectedCustomerId && selectedCustomerId !== 'all' && brc.invoice?.customerId.toString() !== selectedCustomerId) return false;
      if (selectedInvoiceId && selectedInvoiceId !== 'all' && brc.related_invoice_id.toString() !== selectedInvoiceId) return false;
      return true;
    }) || [];

    return { pending, received, notRequired };
  }, [invoices, brcRecords, selectedCustomerId, selectedInvoiceId]);

  // Create/Update BRC mutation
  const brcMutation = useMutation({
    mutationFn: async (data: BrcFormData) => {
      // If there's a file, upload it first and get the path
      let documentPath = null;
      if (data.file) {
        // Find the invoice to get the invoice number and issue date
        const invoice = invoices?.find((inv: any) => inv.id === data.invoiceId);
        if (invoice) {
          // Calculate financial year from issue date
          const issueDate = new Date(invoice.issueDate);
          const financialYear = issueDate.getMonth() >= 3 ? issueDate.getFullYear() : issueDate.getFullYear() - 1;
          
          // Create the GCS path: Accounts/{FY}/{Invoice Number}.pdf
          const gcsPath = `Accounts/${financialYear}/${invoice.invoiceNumber}.pdf`;
          
          // Upload file to GCS
          const formData = new FormData();
          formData.append('file', data.file);
          formData.append('fileName', `${invoice.invoiceNumber}.pdf`);
          formData.append('filePath', gcsPath);
          
          const uploadResponse = await fetch('/api/finance/upload/gcs', {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to upload BRC document');
          }
          
          const uploadResult = await uploadResponse.json();
          documentPath = uploadResult.filePath;
        }
      }

      const submitData = {
        ...data,
        documentPath,
        file: undefined // Remove file from the data sent to BRC endpoint
      };

      if (editingBrc) {
        const response = await fetch(`/api/finance/brc/${editingBrc.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submitData),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update BRC');
        }
        
        return response.json();
      } else {
        const response = await fetch('/api/finance/brc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submitData),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create BRC');
        }
        
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/brc'] });
      setDialogOpen(false);
      setEditingBrc(null);
      resetForm();
      toast({
        title: 'Success',
        description: `BRC ${editingBrc ? 'updated' : 'created'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${editingBrc ? 'update' : 'create'} BRC`,
        variant: 'destructive',
      });
    },
  });

  // Mark invoice as domestic (BRC not required) mutation
  const markDomesticMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetch(`/api/finance/invoices/${invoiceId}/mark-domestic`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark invoice as domestic');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invoice Updated",
        description: "Invoice has been marked as domestic (BRC not required).",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/brc'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice status.",
        variant: "destructive",
      });
    }
  });

  const handleMarkAsDomestic = (invoiceId: number) => {
    markDomesticMutation.mutate(invoiceId);
  };

  const resetForm = () => {
    setFormData({
      invoiceId: 0,
      brcNumber: '',
      brcDate: format(new Date(), 'yyyy-MM-dd'),
      bankName: '',
      amountRealized: 0,
      currency: 'USD',
      notes: ''
    });
  };

  const handleAddNew = () => {
    resetForm();
    setEditingBrc(null);
    setDialogOpen(true);
  };

  const handleEditBrc = (brc: any) => {
    setEditingBrc(brc);
    setFormData({
      invoiceId: brc.related_invoice_id || brc.invoiceId,
      brcNumber: brc.certificate_number || brc.brcNumber,
      brcDate: brc.issue_date ? format(new Date(brc.issue_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      bankName: brc.bank_name || brc.bankName || '',
      amountRealized: parseFloat(brc.amount || brc.amountRealized || 0),
      currency: brc.currency || 'USD',
      notes: brc.notes || ''
    });
    setDialogOpen(true);
  };

  const handleViewDocument = (brc: any) => {
    if (brc.document_path) {
      const bucketName = 'thermopac_storage';
      const documentUrl = `https://storage.cloud.google.com/${bucketName}/${brc.document_path}`;
      window.open(documentUrl, '_blank');
    } else {
      toast({
        title: "No Document",
        description: "No document has been uploaded for this BRC.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = () => {
    if (!formData.invoiceId || !formData.brcNumber || !formData.bankName) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    brcMutation.mutate(formData);
    setIsSubmitting(false);
  };

  const filteredInvoices = useMemo(() => {
    if (!invoices || !selectedCustomerId) return [];
    return invoices.filter((inv: any) => 
      inv.customerId?.toString() === selectedCustomerId && inv.isExport
    );
  }, [invoices, selectedCustomerId]);

  return (
    <Layout>
      <Helmet>
        <title>BRC Management - Finance</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">BRC Management</h1>
            <p className="text-muted-foreground">
              Manage Bank Realization Certificates for export transactions
            </p>
          </div>
          <Button onClick={handleAddNew} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New BRC
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer">Customer</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.map((customer: any) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.companyName || customer.bpName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invoice">Invoice</Label>
                <Select 
                  value={selectedInvoiceId} 
                  onValueChange={setSelectedInvoiceId}

                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Invoices</SelectItem>
                    {filteredInvoices?.map((invoice: any) => (
                      <SelectItem key={invoice.id} value={invoice.id.toString()}>
                        {invoice.invoiceNumber} - {formatRupees(parseFloat(invoice.totalAmount || 0))} {invoice.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              BRC Pending ({filteredData.pending.length})
            </TabsTrigger>
            <TabsTrigger value="received" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              BRC Received ({filteredData.received.length})
            </TabsTrigger>
            <TabsTrigger value="not-required" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              BRC Not Required ({filteredData.notRequired.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Export Invoices Pending BRC</CardTitle>
                <CardDescription>
                  Export invoices that have not yet received Bank Realization Certificates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingInvoices ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="ml-2">Loading invoices...</span>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.pending.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No pending BRC invoices found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredData.pending.map((invoice: any) => (
                          <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                            <TableCell>{invoice.customerName}</TableCell>
                            <TableCell>
                              {invoice.issueDate ? format(new Date(invoice.issueDate), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell>{formatRupees(parseFloat(invoice.totalAmount || 0))} {invoice.currency}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => {
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      invoiceId: invoice.id,
                                      amountRealized: parseFloat(invoice.totalAmount || 0),
                                      currency: invoice.currency || 'USD'
                                    }));
                                    setEditingBrc(null);
                                    setDialogOpen(true);
                                  }}
                                >
                                  Add BRC
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleMarkAsDomestic(invoice.id)}
                                >
                                  Mark as Domestic
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="received" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>BRC Records Received</CardTitle>
                <CardDescription>
                  Bank Realization Certificates that have been received and recorded
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingBrcs ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="ml-2">Loading BRC records...</span>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>BRC Number</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>BRC Date</TableHead>
                        <TableHead>Bank Name</TableHead>
                        <TableHead>Amount Realized</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.received.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            No BRC records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredData.received.map((brc: any) => (
                          <TableRow 
                            key={brc.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleEditBrc(brc)}
                          >
                            <TableCell className="font-medium">{brc.certificate_number}</TableCell>
                            <TableCell>{brc.invoice_number}</TableCell>
                            <TableCell>{brc.customer_name}</TableCell>
                            <TableCell>
                              {brc.issue_date ? format(new Date(brc.issue_date), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell>{brc.bank_name}</TableCell>
                            <TableCell>
                              {formatRupees(brc.amount || 0)} {brc.currency}
                            </TableCell>
                            <TableCell>
                              <Badge variant="default">Received</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditBrc(brc);
                                  }}
                                  title="Edit BRC"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {brc.document_path && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewDocument(brc);
                                    }}
                                    title="View Document"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="not-required" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Invoices Not Requiring BRC</CardTitle>
                <CardDescription>
                  Domestic invoices that do not require Bank Realization Certificates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingInvoices ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.notRequired.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No domestic invoices found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredData.notRequired.map((invoice: any) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell>
                              {invoice.customerName}
                            </TableCell>
                            <TableCell>
                              {invoice.issueDate ? format(new Date(invoice.issueDate), 'MMM dd, yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                              {formatRupees(parseFloat(invoice.totalAmount || 0))} {invoice.currency}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                Domestic
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add/Edit BRC Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingBrc ? 'Edit BRC' : 'Add New BRC'}
              </DialogTitle>
              <DialogDescription>
                {editingBrc 
                  ? 'Update the Bank Realization Certificate details'
                  : 'Add a new Bank Realization Certificate for the export transaction'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Selected Invoice Information */}
              {formData.invoiceId && (
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">Selected Invoice Details</h4>
                  {(() => {
                    const selectedInvoice = invoices?.find((inv: any) => inv.id === formData.invoiceId);
                    return selectedInvoice ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Invoice Number:</span> {selectedInvoice.invoiceNumber}
                        </div>
                        <div>
                          <span className="font-medium">Customer:</span> {selectedInvoice.customer?.companyName || selectedInvoice.customer?.bpName}
                        </div>
                        <div>
                          <span className="font-medium">Amount:</span> {formatRupees(parseFloat(selectedInvoice.totalAmount || 0))} {selectedInvoice.currency}
                        </div>
                        <div>
                          <span className="font-medium">Date:</span> {selectedInvoice.invoiceDate ? format(new Date(selectedInvoice.invoiceDate), 'dd/MM/yyyy') : '-'}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceSelect">
                    {formData.invoiceId ? `Invoice ID: ${formData.invoiceId}` : 'Invoice *'}
                  </Label>
                  {formData.invoiceId ? (
                    // Show invoice as read-only when pre-selected
                    <div className="px-3 py-2 border rounded-md bg-muted/50 text-sm">
                      {(() => {
                        const selectedInvoice = invoices?.find((inv: any) => inv.id === formData.invoiceId);
                        return selectedInvoice ? 
                          `${selectedInvoice.invoiceNumber} - ${selectedInvoice.customer?.companyName || selectedInvoice.customer?.bpName}` 
                          : 'Invoice not found';
                      })()}
                    </div>
                  ) : (
                    // Show dropdown only when no invoice is pre-selected
                    <Select 
                      value={formData.invoiceId ? formData.invoiceId.toString() : ''} 
                      onValueChange={(value) => {
                        const selectedInvoice = filteredInvoices?.find((inv: any) => inv.id === parseInt(value));
                        setFormData(prev => ({ 
                          ...prev, 
                          invoiceId: parseInt(value),
                          amountRealized: selectedInvoice ? parseFloat(selectedInvoice.totalAmount || 0) : 0,
                          currency: selectedInvoice?.currency || 'USD'
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredInvoices?.map((invoice: any) => (
                          <SelectItem key={invoice.id} value={invoice.id.toString()}>
                            {invoice.invoiceNumber} - {invoice.customer?.companyName || invoice.customer?.bpName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label htmlFor="brcNumber">BRC Number *</Label>
                  <Input
                    id="brcNumber"
                    value={formData.brcNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, brcNumber: e.target.value }))}
                    placeholder="Enter BRC number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="brcDate">BRC Date</Label>
                  <Input
                    id="brcDate"
                    type="date"
                    value={formData.brcDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, brcDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="bankName">Bank Name *</Label>
                  <Input
                    id="bankName"
                    value={formData.bankName}
                    onChange={(e) => setFormData(prev => ({ ...prev, bankName: e.target.value }))}
                    placeholder="Enter bank name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amountRealized">Amount Realized</Label>
                  <Input
                    id="amountRealized"
                    type="number"
                    step="0.01"
                    value={formData.amountRealized}
                    onChange={(e) => setFormData(prev => ({ ...prev, amountRealized: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select 
                    value={formData.currency} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="file">BRC Document</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFormData(prev => ({ ...prev, file: e.target.files?.[0] }))}
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingBrc ? 'Update' : 'Save'} BRC
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}