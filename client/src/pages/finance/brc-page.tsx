import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Plus, Loader2, AlertCircle, Search, Upload } from 'lucide-react';
import Layout from '@/components/layout';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatRupees } from '@/lib/utils';

export default function BrcPageFixed() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  // Fetch all BRCs
  const { data: brcs, isLoading: isLoadingBrcs } = useQuery({
    queryKey: ['/api/finance/brc'],
    enabled: true
  });

  // Fetch export invoices that need BRC
  const { data: exportInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['/api/finance/invoices?isExport=true'],
    enabled: true
  });

  const handleCreateBrc = () => {
    setDialogOpen(true);
  };

  return (
    <Layout>
      <Helmet>
        <title>Bank Realization Certificates (BRC) - Thermopac</title>
      </Helmet>

      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Bank Realization Certificates</h1>
            <p className="text-muted-foreground mt-2">
              Track and manage BRCs for export transactions and foreign currency receipts
            </p>
          </div>
          <Button onClick={handleCreateBrc}>
            <Plus className="h-4 w-4 mr-2" />
            Add New BRC
          </Button>
        </div>

        {/* How to Use BRC System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              How to Use the BRC System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">What is a BRC?</h3>
                <p className="text-sm text-muted-foreground">
                  A Bank Realization Certificate confirms that export proceeds have been received 
                  in foreign currency. It's required for export transactions to comply with 
                  FEMA regulations in India.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">When to Create a BRC?</h3>
                <p className="text-sm text-muted-foreground">
                  Create a BRC when you receive payment confirmation from your bank for 
                  export invoices. This links the certificate to the specific export transaction.
                </p>
              </div>
            </div>
            
            <div className="border-l-4 border-blue-500 pl-4 bg-blue-50 p-3 rounded">
              <h4 className="font-semibold text-blue-900">Step-by-Step Process:</h4>
              <ol className="list-decimal list-inside text-sm text-blue-800 mt-2 space-y-1">
                <li>Create export invoices and mark them as requiring BRC</li>
                <li>When payment is received, your bank issues a BRC document</li>
                <li>Click "Add New BRC" to upload the certificate</li>
                <li>Link the BRC to the corresponding export invoice</li>
                <li>Track BRC status for compliance reporting</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Search and Filter */}
        <Card>
          <CardHeader>
            <CardTitle>Search BRCs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by BRC number, bank name, or amount..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* BRC Records */}
        <Card>
          <CardHeader>
            <CardTitle>BRC Records</CardTitle>
            <CardDescription>
              All Bank Realization Certificates for export transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingBrcs ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-4" />
                Loading BRC records...
              </div>
            ) : !brcs || brcs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No BRC records found</p>
                <p className="text-sm">Create your first BRC when you receive export payments</p>
                <Button className="mt-4" onClick={handleCreateBrc}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First BRC
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BRC Number</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Bank Name</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Related Invoice</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brcs?.map((brc: any) => (
                    <TableRow key={brc.id}>
                      <TableCell className="font-medium">{brc.certificateNumber}</TableCell>
                      <TableCell>{new Date(brc.issueDate).toLocaleDateString()}</TableCell>
                      <TableCell>{brc.bankName}</TableCell>
                      <TableCell>{formatRupees(parseFloat(brc.amount))}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{brc.currency}</Badge>
                      </TableCell>
                      <TableCell>
                        {brc.relatedInvoiceId ? (
                          <Badge variant="secondary">Invoice #{brc.relatedInvoiceId}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {brc.documentPath ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <FileText className="h-3 w-3 mr-1" />
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create BRC Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New BRC</DialogTitle>
              <DialogDescription>
                Add a Bank Realization Certificate for an export transaction
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="invoiceSelect">Select Export Invoice</Label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose the export invoice for this BRC" />
                  </SelectTrigger>
                  <SelectContent>
                    {exportInvoices?.filter((invoice: any) => invoice.isExport)?.map((invoice: any) => (
                      <SelectItem key={invoice.id} value={invoice.id.toString()}>
                        {invoice.invoiceNumber} - {invoice.customer?.companyName || 'Customer'} - {formatRupees(parseFloat(invoice.totalAmount || invoice.amount || 0))} {invoice.currency || 'USD'}
                      </SelectItem>
                    ))}
                    {exportInvoices?.length > 0 && !exportInvoices?.some((inv: any) => inv.isExport) && (
                      <SelectItem value="no-export" disabled>
                        No export invoices found (mark invoices as export transactions)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {!exportInvoices?.length && !isLoadingInvoices && (
                  <p className="text-sm text-muted-foreground mt-1">
                    No export invoices found. Create export invoices first and mark them as requiring BRC.
                  </p>
                )}
                {isLoadingInvoices && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Loading export invoices...
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="brcNumber">BRC Certificate Number</Label>
                <Input
                  id="brcNumber"
                  placeholder="Enter BRC number from bank"
                />
              </div>
              
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  placeholder="Name of issuing bank"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    placeholder="USD"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input
                  id="issueDate"
                  type="date"
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              
              <div>
                <Label htmlFor="document">Upload BRC Document</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-500">PDF, JPG, PNG (max 10MB)</p>
                </div>
              </div>
              
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about this BRC"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create BRC'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}