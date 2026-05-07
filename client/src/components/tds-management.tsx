import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, Settings, FileText, IndianRupee, CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

const FY_OPTIONS = ['2024-25', '2025-26', '2026-27'];

// R5: Old Regime fields removed — only previous employer income and other income retained
const declarationFormSchema = z.object({
  userId: z.number().min(1),
  financialYear: z.string().min(1),
  previousEmployerIncome: z.string().default('0'),
  previousEmployerTds: z.string().default('0'),
  otherIncome: z.string().default('0'),
});

type DeclarationFormValues = z.infer<typeof declarationFormSchema>;

function formatCurrency(val: string | number | null | undefined): string {
  const num = parseFloat(String(val || '0'));
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

// R6: Old Regime card removed — New Regime only
function TaxSlabsPanel() {
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const { toast } = useToast();

  const { data: slabs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/tax-slabs', selectedFy],
    queryFn: () => fetch(`/api/payroll/tax-slabs?fy=${selectedFy}`).then(r => r.json()),
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/payroll/tax-slabs/seed-defaults', { financialYear: selectedFy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/tax-slabs', selectedFy] });
      toast({ title: 'Default tax slabs loaded' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const newSlabs = slabs.filter((s: any) => s.regime === 'new');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={selectedFy} onValueChange={setSelectedFy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map(fy => (
                <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending || newSlabs.length > 0} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Load Default Slabs
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading tax slabs...</div>
      ) : newSlabs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No tax slabs configured for FY {selectedFy}</p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              Load New Regime Slabs (FY {selectedFy})
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700">New Regime</Badge>
              Standard Deduction: {formatCurrency(newSlabs[0]?.standardDeduction)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Income Range</th>
                  <th className="text-right py-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {newSlabs.map((slab: any) => (
                  <tr key={slab.id} className="border-b last:border-0">
                    <td className="py-2">
                      {formatCurrency(slab.minIncome)} – {slab.maxIncome ? formatCurrency(slab.maxIncome) : 'Above'}
                    </td>
                    <td className="text-right py-2 font-medium">{slab.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-xs text-gray-500">
              Cess: {newSlabs[0]?.cessRate}% &nbsp;|&nbsp; Section 87A rebate: up to ₹60,000 (taxable income ≤ ₹12,00,000)
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// R5: Regime selector and Old Regime fields removed; approval workflow retained
function TaxDeclarationsPanel() {
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: declarations = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/tax-declarations', selectedFy],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/tax-declarations?fy=${selectedFy}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const form = useForm<DeclarationFormValues>({
    resolver: zodResolver(declarationFormSchema),
    defaultValues: {
      userId: 0,
      financialYear: selectedFy,
      previousEmployerIncome: '0',
      previousEmployerTds: '0',
      otherIncome: '0',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: DeclarationFormValues) =>
      editingId
        ? apiRequest('PUT', `/api/payroll/tax-declarations/${editingId}`, data)
        : apiRequest('POST', '/api/payroll/tax-declarations', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/tax-declarations', selectedFy] });
      toast({ title: editingId ? 'Declaration updated' : 'Declaration created' });
      setShowForm(false);
      setEditingId(null);
      form.reset();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'reject' }) =>
      apiRequest('POST', `/api/payroll/tax-declarations/${id}/${action}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/tax-declarations', selectedFy] });
      toast({ title: 'Declaration updated' });
    },
  });

  const handleEdit = (decl: any) => {
    setEditingId(decl.id);
    form.reset({
      userId: decl.userId,
      financialYear: decl.financialYear,
      previousEmployerIncome: decl.previousEmployerIncome || '0',
      previousEmployerTds: decl.previousEmployerTds || '0',
      otherIncome: decl.otherIncome || '0',
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({ financialYear: selectedFy, userId: 0 });
    setShowForm(true);
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      submitted: 'bg-blue-100 text-blue-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return <Badge className={colors[status] || 'bg-gray-100'}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={selectedFy} onValueChange={setSelectedFy}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FY_OPTIONS.map(fy => (
              <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleNew} size="sm">
          <FileText className="h-4 w-4 mr-2" />
          New Declaration
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : declarations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No tax declarations for FY {selectedFy}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-3">Employee</th>
                <th className="text-right py-3 px-3">Prev Employer Income</th>
                <th className="text-right py-3 px-3">Prev Employer TDS</th>
                <th className="text-right py-3 px-3">Other Income</th>
                <th className="text-center py-3 px-3">Status</th>
                <th className="text-center py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {declarations.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{d.userName}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.previousEmployerIncome)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.previousEmployerTds)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.otherIncome)}</td>
                  <td className="py-2 px-3 text-center">{statusBadge(d.status)}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(d)}>Edit</Button>
                      {d.status === 'submitted' && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-600" onClick={() => approveMutation.mutate({ id: d.id, action: 'approve' })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => approveMutation.mutate({ id: d.id, action: 'reject' })}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingId(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Tax Declaration' : 'New Tax Declaration'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="userId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select value={String(field.value || '')} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allUsers.map((u: any) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="financialYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Financial Year</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FY_OPTIONS.map(fy => (
                          <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />
              <h4 className="font-semibold text-sm">Previous Employer &amp; Other Income</h4>
              <p className="text-xs text-gray-500">These fields affect projected annual taxable income. Only approved declarations are used in TDS computation.</p>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="previousEmployerIncome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prev Employer Income (₹)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="previousEmployerTds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prev Employer TDS (₹)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="otherIncome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Income (₹)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
                {!editingId && (
                  <Button type="submit" variant="outline" onClick={() => form.setValue('status' as any, 'draft')}>
                    Save as Draft
                  </Button>
                )}
                <Button type="submit" disabled={createMutation.isPending}>
                  {editingId ? 'Update' : 'Submit Declaration'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// GAP-01: Compute TDS button disabled when period is locked; regime column removed
function TdsDashboardPanel() {
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const { toast } = useToast();

  const { data: periods = [] } = useQuery<any[]>({
    queryKey: ['/api/payroll/payroll-periods'],
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  const { data: tdsRecords = [], isLoading: tdsLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/tds/period', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return [];
      const res = await fetch(`/api/payroll/tds/period/${selectedPeriodId}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedPeriodId,
  });

  const computeMutation = useMutation({
    mutationFn: (periodId: number) => apiRequest('POST', `/api/payroll/tds/compute/${periodId}`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/tds/period', selectedPeriodId] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      toast({ title: 'TDS Computed', description: `Processed: ${data.processed}, Errors: ${data.errors}` });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const processedPeriods = periods.filter((p: any) =>
    ['processed', 'reviewed', 'approved', 'paid', 'locked'].includes(p.status)
  );

  const selectedPeriod = periods.find((p: any) => p.id === selectedPeriodId);
  const isLocked = selectedPeriod?.status === 'locked';

  const handleComputeTds = () => {
    if (!selectedPeriodId) return;
    if (isLocked) {
      toast({
        title: 'Period Locked',
        description: 'TDS cannot be re-computed on a locked period. The challan may already be posted to SAP.',
        variant: 'destructive',
      });
      return;
    }
    computeMutation.mutate(selectedPeriodId);
  };

  const totalTdsMonth = tdsRecords.reduce((s: number, r: any) => s + parseFloat(r.tdsActualMonthly || '0'), 0);
  const totalTdsYtd = tdsRecords.reduce((s: number, r: any) => s + parseFloat(r.tdsDeductedYtd || '0'), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={String(selectedPeriodId || '')} onValueChange={(v) => setSelectedPeriodId(parseInt(v))}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select payroll period" />
            </SelectTrigger>
            <SelectContent>
              {processedPeriods.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedPeriodId && (
          <Button
            onClick={handleComputeTds}
            disabled={computeMutation.isPending || isLocked}
            size="sm"
            variant={isLocked ? 'outline' : 'default'}
          >
            {isLocked
              ? <><AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />Period Locked</>
              : <><Calculator className="h-4 w-4 mr-2" />{computeMutation.isPending ? 'Computing...' : 'Compute TDS'}</>
            }
          </Button>
        )}
      </div>

      {isLocked && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>This period is locked. TDS records are final and may be posted to SAP. Re-computation is disabled.</span>
        </div>
      )}

      {selectedPeriodId && tdsRecords.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{tdsRecords.length}</div>
              <div className="text-sm text-gray-600">Employees</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalTdsMonth)}</div>
              <div className="text-sm text-gray-600">TDS This Month</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(totalTdsYtd)}</div>
              <div className="text-sm text-gray-600">TDS YTD (Cumulative)</div>
            </CardContent>
          </Card>
        </div>
      )}

      {!selectedPeriodId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Select a payroll period to view TDS records</p>
          </CardContent>
        </Card>
      ) : tdsLoading ? (
        <div className="text-center py-8 text-gray-500">Loading TDS records...</div>
      ) : tdsRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IndianRupee className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No TDS records for this period</p>
            {!isLocked && (
              <Button onClick={handleComputeTds} disabled={computeMutation.isPending}>
                Compute TDS Now
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-3">Employee</th>
                <th className="text-right py-3 px-3">Gross Salary</th>
                <th className="text-right py-3 px-3">Projected Taxable</th>
                <th className="text-right py-3 px-3">Annual Tax</th>
                <th className="text-right py-3 px-3">TDS This Month</th>
                <th className="text-right py-3 px-3">TDS YTD</th>
              </tr>
            </thead>
            <tbody>
              {tdsRecords.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{r.userName}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(r.grossSalaryMonthly)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(r.taxableIncomeProjected)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(r.totalTaxLiabilityAnnual)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-blue-600">{formatCurrency(r.tdsActualMonthly)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(r.tdsDeductedYtd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold bg-gray-50">
                <td className="py-2 px-3" colSpan={4}>Total</td>
                <td className="py-2 px-3 text-right text-blue-600">{formatCurrency(totalTdsMonth)}</td>
                <td className="py-2 px-3 text-right">{formatCurrency(totalTdsYtd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function TdsManagementTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5" />
          Income Tax &amp; TDS Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="slabs" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="slabs">
              <Settings className="h-4 w-4 mr-2" />
              Tax Slabs
            </TabsTrigger>
            <TabsTrigger value="declarations">
              <FileText className="h-4 w-4 mr-2" />
              Declarations
            </TabsTrigger>
            <TabsTrigger value="tds-dashboard">
              <Calculator className="h-4 w-4 mr-2" />
              TDS Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="slabs" className="mt-4">
            <TaxSlabsPanel />
          </TabsContent>

          <TabsContent value="declarations" className="mt-4">
            <TaxDeclarationsPanel />
          </TabsContent>

          <TabsContent value="tds-dashboard" className="mt-4">
            <TdsDashboardPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
