import React from 'react';
import { Helmet } from 'react-helmet';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Plus, Download } from 'lucide-react';
import Layout from '@/components/layout';
import { formatRupees } from '@/lib/utils';

export default function BrcPageSimple() {
  // Fetch existing BRCs
  const { data: brcs, isLoading } = useQuery({
    queryKey: ['/api/finance/brc'],
    enabled: true
  });

  return (
    <Layout>
      <Helmet>
        <title>Bank Realization Certificates (BRC) - Thermopac</title>
      </Helmet>

      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold pl-4">Bank Realization Certificates</h1>
            <p className="text-muted-foreground mt-2">
              Manage BRCs for export transactions and foreign currency receipts
            </p>
          </div>
          <Button>
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
                  FEMA regulations.
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
                <li>Create export invoices and mark them as "Export Required"</li>
                <li>When payment is received, your bank issues a BRC document</li>
                <li>Use "Add New BRC" to upload the certificate and link it to the invoice</li>
                <li>Track BRC status for compliance reporting</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* BRC Records */}
        <Card>
          <CardHeader>
            <CardTitle>BRC Records</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading BRC records...</div>
            ) : !brcs || brcs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No BRC records found</p>
                <p className="text-sm">Create your first BRC when you receive export payments</p>
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
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Export Invoices Awaiting BRC */}
        <Card>
          <CardHeader>
            <CardTitle>Export Invoices Pending BRC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No export invoices pending BRC</p>
              <p className="text-sm">Export invoices requiring BRC will appear here</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}