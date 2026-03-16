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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calculator, Settings, FileText, IndianRupee, Shield, CheckCircle, XCircle, Clock, RefreshCw, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

const FY_OPTIONS = ['2024-25', '2025-26', '2026-27'];

const declarationFormSchema = z.object({
  userId: z.number().min(1),
  financialYear: z.string().min(1),
  regime: z.enum(['old', 'new']),
  monthlyRentPaid: z.string().default('0'),
  isMetroCity: z.boolean().default(false),
  section80c: z.string().default('0'),
  section80ccd1b: z.string().default('0'),
  section80d: z.string().default('0'),
  section80dParents: z.string().default('0'),
  section80e: z.string().default('0'),
  section80g: z.string().default('0'),
  section80tta: z.string().default('0'),
  section24b: z.string().default('0'),
  otherDeductions: z.string().default('0'),
  otherDeductionsDescription: z.string().optional(),
  previousEmployerIncome: z.string().default('0'),
  previousEmployerTds: z.string().default('0'),
  otherIncome: z.string().default('0'),
});

type DeclarationFormValues = z.infer<typeof declarationFormSchema>;

function formatCurrency(val: string | number | null | undefined): string {
  const num = parseFloat(String(val || '0'));
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

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

  const oldSlabs = slabs.filter((s: any) => s.regime === 'old');
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
        <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending || slabs.length > 0} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Load Default Slabs
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading tax slabs...</div>
      ) : slabs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 mb-4">No tax slabs configured for FY {selectedFy}</p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              Load Indian Tax Slabs (FY {selectedFy})
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
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
                Cess: {newSlabs[0]?.cessRate}% | Rebate u/s 87A: Up to {formatCurrency(newSlabs[0]?.section87aRebateLimit)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant="outline" className="bg-orange-50 text-orange-700">Old Regime</Badge>
                Standard Deduction: {formatCurrency(oldSlabs[0]?.standardDeduction)}
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
                  {oldSlabs.map((slab: any) => (
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
                Cess: {oldSlabs[0]?.cessRate}% | Rebate u/s 87A: Up to {formatCurrency(oldSlabs[0]?.section87aRebateLimit)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TaxDeclarationsPanel() {
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: declarations = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/tax-declarations', selectedFy],
    queryFn: () => fetch(`/api/payroll/tax-declarations?fy=${selectedFy}`).then(r => r.json()),
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const form = useForm<DeclarationFormValues>({
    resolver: zodResolver(declarationFormSchema),
    defaultValues: {
      userId: 0,
      financialYear: selectedFy,
      regime: 'new',
      monthlyRentPaid: '0',
      isMetroCity: false,
      section80c: '0',
      section80ccd1b: '0',
      section80d: '0',
      section80dParents: '0',
      section80e: '0',
      section80g: '0',
      section80tta: '0',
      section24b: '0',
      otherDeductions: '0',
      otherDeductionsDescription: '',
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
      regime: decl.regime,
      monthlyRentPaid: decl.monthlyRentPaid || '0',
      isMetroCity: decl.isMetroCity || false,
      section80c: decl.section80c || '0',
      section80ccd1b: decl.section80ccd1b || '0',
      section80d: decl.section80d || '0',
      section80dParents: decl.section80dParents || '0',
      section80e: decl.section80e || '0',
      section80g: decl.section80g || '0',
      section80tta: decl.section80tta || '0',
      section24b: decl.section24b || '0',
      otherDeductions: decl.otherDeductions || '0',
      otherDeductionsDescription: decl.otherDeductionsDescription || '',
      previousEmployerIncome: decl.previousEmployerIncome || '0',
      previousEmployerTds: decl.previousEmployerTds || '0',
      otherIncome: decl.otherIncome || '0',
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingId(null);
    form.reset({ financialYear: selectedFy, regime: 'new', userId: 0 });
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

  const selectedRegime = form.watch('regime');

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
                <th className="text-left py-3 px-3">Regime</th>
                <th className="text-right py-3 px-3">80C</th>
                <th className="text-right py-3 px-3">80D</th>
                <th className="text-right py-3 px-3">HRA Rent</th>
                <th className="text-right py-3 px-3">Sec 24b</th>
                <th className="text-right py-3 px-3">Prev Emp Income</th>
                <th className="text-center py-3 px-3">Status</th>
                <th className="text-center py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {declarations.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{d.userName}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className={d.regime === 'new' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}>
                      {d.regime}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.section80c)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.section80d)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.monthlyRentPaid)}/mo</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.section24b)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(d.previousEmployerIncome)}</td>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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

                <FormField control={form.control} name="regime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Regime</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="new">New Regime (Lower rates, fewer deductions)</SelectItem>
                        <SelectItem value="old">Old Regime (Higher rates, more deductions)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />
              <h4 className="font-semibold text-sm">Previous Employer & Other Income</h4>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="previousEmployerIncome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prev Employer Income</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="previousEmployerTds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prev Employer TDS</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="otherIncome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Income</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>

              {selectedRegime === 'old' && (
                <>
                  <Separator />
                  <h4 className="font-semibold text-sm">HRA Exemption</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="monthlyRentPaid" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Rent Paid</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="isMetroCity" render={({ field }) => (
                      <FormItem className="flex items-center gap-3 pt-6">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Metro City (50% of Basic)</FormLabel>
                      </FormItem>
                    )} />
                  </div>

                  <Separator />
                  <h4 className="font-semibold text-sm">Chapter VI-A Deductions</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="section80c" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80C (max 1.5L)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80ccd1b" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80CCD(1B) - NPS</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80d" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80D - Self/Family</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80dParents" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80D - Parents</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80e" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80E - Education Loan</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80g" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80G - Donations</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section80tta" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 80TTA - Savings Interest</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="section24b" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section 24(b) - Home Loan (max 2L)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="otherDeductions" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Other Deductions</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="otherDeductionsDescription" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl><Textarea rows={1} {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </>
              )}

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

function TdsDashboardPanel() {
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const { toast } = useToast();

  const { data: periods = [] } = useQuery<any[]>({
    queryKey: ['/api/payroll/payroll-periods'],
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  const { data: tdsRecords = [], isLoading: tdsLoading } = useQuery<any[]>({
    queryKey: ['/api/payroll/tds/period', selectedPeriodId],
    queryFn: () => selectedPeriodId ? fetch(`/api/payroll/tds/period/${selectedPeriodId}`).then(r => r.json()) : Promise.resolve([]),
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

  const processedPeriods = periods.filter((p: any) => ['processed', 'reviewed', 'approved', 'paid', 'locked'].includes(p.status));

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
            onClick={() => computeMutation.mutate(selectedPeriodId)}
            disabled={computeMutation.isPending}
            size="sm"
          >
            <Calculator className="h-4 w-4 mr-2" />
            {computeMutation.isPending ? 'Computing...' : 'Compute TDS'}
          </Button>
        )}
      </div>

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
            <Button onClick={() => computeMutation.mutate(selectedPeriodId)} disabled={computeMutation.isPending}>
              Compute TDS Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-3">Employee</th>
                <th className="text-center py-3 px-3">Regime</th>
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
                  <td className="py-2 px-3 text-center">
                    <Badge variant="outline" className={r.regime === 'new' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}>
                      {r.regime}
                    </Badge>
                  </td>
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
                <td className="py-2 px-3" colSpan={5}>Total</td>
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
          Income Tax & TDS Management
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
