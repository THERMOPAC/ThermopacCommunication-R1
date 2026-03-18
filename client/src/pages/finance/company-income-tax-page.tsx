import { useState } from "react";
import Layout from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, Calculator, IndianRupee, FileText, TrendingUp, AlertTriangle,
  Plus, Check, X, Clock, ArrowUpDown, Landmark, Shield, Scale
} from "lucide-react";

function fmt(v: any): string {
  const n = parseFloat(v || '0');
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    filed: 'bg-blue-100 text-blue-800',
    assessed: 'bg-purple-100 text-purple-800',
    closed: 'bg-gray-100 text-gray-800',
    upcoming: 'bg-blue-100 text-blue-800',
    due: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    short_paid: 'bg-orange-100 text-orange-800',
    draft: 'bg-gray-100 text-gray-800',
    posted: 'bg-blue-100 text-blue-800',
    verified: 'bg-green-100 text-green-800',
    reversed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    processed: 'bg-blue-100 text-blue-800',
    refund_issued: 'bg-green-100 text-green-800',
    demand_raised: 'bg-red-100 text-red-800',
    received: 'bg-yellow-100 text-yellow-800',
    response_filed: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
  };
  return <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>{status?.replace(/_/g, ' ')}</Badge>;
}

function formatDate(d: any): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CompanyIncomeTaxPage() {
  const { toast } = useToast();
  const [selectedTaxYearId, setSelectedTaxYearId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showTaxYearDialog, setShowTaxYearDialog] = useState(false);
  const [showEstimateDialog, setShowEstimateDialog] = useState(false);
  const [showChallanDialog, setShowChallanDialog] = useState(false);
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<any>(null);

  const { data: taxYears = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/tax-years'],
  });

  const { data: dashboard } = useQuery<any>({
    queryKey: ['/api/company-tax/dashboard', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/dashboard?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: estimates = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/estimates', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/estimates?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: advanceTax = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/advance-tax', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/advance-tax?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: challans = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/challans', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/challans?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: provisions = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/provisions', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/provisions?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: returns = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/returns', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/returns?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: notices = [] } = useQuery<any[]>({
    queryKey: ['/api/company-tax/notices', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/notices?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: reconciliation } = useQuery<any>({
    queryKey: ['/api/company-tax/reconciliation', selectedTaxYearId],
    enabled: !!selectedTaxYearId,
    queryFn: () => fetch(`/api/company-tax/reconciliation?taxYearId=${selectedTaxYearId}`, { credentials: 'include' }).then(r => r.json()),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['/api/company-tax'] });
  }

  const selectedTaxYear = taxYears.find((ty: any) => ty.id === selectedTaxYearId);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Company Income Tax</h1>
              <p className="text-sm text-muted-foreground">Corporate profit tax compliance and tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedTaxYearId?.toString() || ''}
              onValueChange={(v) => setSelectedTaxYearId(parseInt(v))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select Assessment Year" />
              </SelectTrigger>
              <SelectContent>
                {taxYears.map((ty: any) => (
                  <SelectItem key={ty.id} value={ty.id.toString()}>
                    {ty.assessmentYear} ({ty.financialYear})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowTaxYearDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Tax Year
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-8 w-full">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="estimates">Tax Estimates</TabsTrigger>
            <TabsTrigger value="advance">Advance Tax</TabsTrigger>
            <TabsTrigger value="provisions">Provisions</TabsTrigger>
            <TabsTrigger value="challans">Challans</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="notices">Notices</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab dashboard={dashboard} selectedTaxYear={selectedTaxYear} selectedTaxYearId={selectedTaxYearId} />
          </TabsContent>

          <TabsContent value="estimates">
            <EstimatesTab
              estimates={estimates}
              selectedTaxYearId={selectedTaxYearId}
              showDialog={showEstimateDialog}
              setShowDialog={setShowEstimateDialog}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="advance">
            <AdvanceTaxTab
              advanceTax={advanceTax}
              selectedTaxYearId={selectedTaxYearId}
              selectedTaxYear={selectedTaxYear}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="provisions">
            <ProvisionsTab
              provisions={provisions}
              selectedTaxYearId={selectedTaxYearId}
              showDialog={showProvisionDialog}
              setShowDialog={setShowProvisionDialog}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="challans">
            <ChallansTab
              challans={challans}
              selectedTaxYearId={selectedTaxYearId}
              showDialog={showChallanDialog}
              setShowDialog={setShowChallanDialog}
              showPaymentDialog={showPaymentDialog}
              setShowPaymentDialog={setShowPaymentDialog}
              selectedChallan={selectedChallan}
              setSelectedChallan={setSelectedChallan}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="returns">
            <ReturnsTab
              returns={returns}
              selectedTaxYearId={selectedTaxYearId}
              showDialog={showReturnDialog}
              setShowDialog={setShowReturnDialog}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="reconciliation">
            <ReconciliationTab reconciliation={reconciliation} selectedTaxYearId={selectedTaxYearId} />
          </TabsContent>

          <TabsContent value="notices">
            <NoticesTab
              notices={notices}
              selectedTaxYearId={selectedTaxYearId}
              showDialog={showNoticeDialog}
              setShowDialog={setShowNoticeDialog}
              invalidateAll={invalidateAll}
              toast={toast}
            />
          </TabsContent>
        </Tabs>

        <TaxYearDialog
          open={showTaxYearDialog}
          onClose={() => setShowTaxYearDialog(false)}
          invalidateAll={invalidateAll}
          toast={toast}
        />
      </div>
    </Layout>
  );
}

function DashboardTab({ dashboard, selectedTaxYear, selectedTaxYearId }: any) {
  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year to view the dashboard</CardContent></Card>;
  if (!dashboard) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>;

  const s = dashboard.summary || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Estimated Tax Liability</div>
            <div className="text-2xl font-bold">₹{fmt(s.estimatedLiability)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Advance Tax Paid</div>
            <div className="text-2xl font-bold text-green-600">₹{fmt(s.advanceTaxPaid)}</div>
            <div className="text-xs text-muted-foreground">
              {s.estimatedLiability > 0 ? `${((s.advanceTaxPaid / s.estimatedLiability) * 100).toFixed(0)}% of liability` : ''}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Self Assessment Paid</div>
            <div className="text-2xl font-bold text-blue-600">₹{fmt(s.selfAssessmentPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Net Payable / (Refund)</div>
            <div className={`text-2xl font-bold ${s.netPayable > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ₹{fmt(Math.abs(s.netPayable))}{s.netPayable < 0 ? ' (Refund)' : ''}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Tax Year Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selectedTaxYear && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Assessment Year</span><span className="font-medium">{selectedTaxYear.assessmentYear}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Financial Year</span><span className="font-medium">{selectedTaxYear.financialYear}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax Regime</span><span className="font-medium">{selectedTaxYear.taxRegime || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Base Tax Rate</span><span className="font-medium">{selectedTaxYear.baseTaxRate}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Surcharge</span><span className="font-medium">{selectedTaxYear.surchargeRate}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cess</span><span className="font-medium">{selectedTaxYear.cessRate}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Effective Rate</span><span className="font-medium">{selectedTaxYear.effectiveRate || '-'}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span>{statusBadge(selectedTaxYear.status)}</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Advance Tax Timeline</CardTitle></CardHeader>
          <CardContent>
            {(dashboard.advanceInstallments || []).length > 0 ? (
              <div className="space-y-3">
                {dashboard.advanceInstallments.map((inst: any) => (
                  <div key={inst.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <span className="font-medium">{inst.installment}</span>
                      <span className="text-sm text-muted-foreground ml-2">Due: {formatDate(inst.dueDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">₹{fmt(inst.amountPaid)} / ₹{fmt(inst.amountDue)}</span>
                      {statusBadge(inst.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No advance tax installments initialized</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">TDS Credits</div>
            <div className="text-lg font-bold">₹{fmt(s.tdsCredits)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total Provisions Booked</div>
            <div className="text-lg font-bold">₹{fmt(s.totalProvisions)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">SAP Postings</div>
            <div className="text-lg font-bold">₹{fmt(s.sapPostings)}</div>
          </CardContent>
        </Card>
      </div>

      {dashboard.returnStatus && (
        <Card>
          <CardHeader><CardTitle className="text-base">ITR Filing Status</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex gap-4">
              <span>Form: {dashboard.returnStatus.formType}</span>
              <span>Type: {dashboard.returnStatus.returnType}</span>
              {statusBadge(dashboard.returnStatus.status)}
              {dashboard.returnStatus.acknowledgementNumber && <span>Ack: {dashboard.returnStatus.acknowledgementNumber}</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EstimatesTab({ estimates, selectedTaxYearId, showDialog, setShowDialog, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({});
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([{ description: '', type: 'add_back', section: '', amount: '' }]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/estimates', data);
    },
    onSuccess: () => { invalidateAll(); setShowDialog(false); toast({ title: 'Estimate created' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  function handleSubmit() {
    const adjustmentDetails = adjustmentRows.filter(r => r.description && r.amount);
    const adjustmentsTotal = adjustmentDetails.reduce((sum: number, r: any) => {
      return sum + (r.type === 'deduction' ? -Math.abs(parseFloat(r.amount || 0)) : Math.abs(parseFloat(r.amount || 0)));
    }, 0);
    createMutation.mutate({
      ...form,
      taxYearId: selectedTaxYearId,
      estimateDate: new Date().toISOString(),
      adjustments: adjustmentsTotal.toFixed(2),
      adjustmentDetails: adjustmentDetails.map(r => ({
        ...r,
        amount: r.type === 'deduction' ? -Math.abs(parseFloat(r.amount)) : Math.abs(parseFloat(r.amount))
      })),
    });
  }

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tax Estimates</h3>
        <Button onClick={() => { setForm({}); setAdjustmentRows([{ description: '', type: 'add_back', section: '', amount: '' }]); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Estimate
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Expenses</TableHead>
            <TableHead className="text-right">PBT</TableHead>
            <TableHead className="text-right">Adjustments</TableHead>
            <TableHead className="text-right">Taxable Income</TableHead>
            <TableHead className="text-right">Tax Liability</TableHead>
            <TableHead className="text-right">Net Payable</TableHead>
            <TableHead>Latest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {estimates.map((e: any) => (
            <TableRow key={e.id}>
              <TableCell>{formatDate(e.estimateDate)}</TableCell>
              <TableCell>{e.estimateLabel || '-'}</TableCell>
              <TableCell className="text-right">₹{fmt(e.grossRevenue)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.totalExpenses)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.profitBeforeTax)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.adjustments)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.taxableIncome)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.effectiveTaxPayable)}</TableCell>
              <TableCell className="text-right">₹{fmt(e.netTaxPayable)}</TableCell>
              <TableCell>{e.isLatest && <Badge className="bg-green-100 text-green-800">Latest</Badge>}</TableCell>
            </TableRow>
          ))}
          {estimates.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No estimates yet</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Tax Estimate</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Label</Label><Input value={form.estimateLabel || ''} onChange={e => setForm({ ...form, estimateLabel: e.target.value })} placeholder="e.g., Q2 Revised" /></div>
            <div><Label>Gross Revenue</Label><Input type="number" value={form.grossRevenue || ''} onChange={e => setForm({ ...form, grossRevenue: e.target.value })} /></div>
            <div><Label>Total Expenses</Label><Input type="number" value={form.totalExpenses || ''} onChange={e => setForm({ ...form, totalExpenses: e.target.value })} /></div>
            <div><Label>Profit Before Tax</Label><Input type="number" value={form.profitBeforeTax || ''} onChange={e => setForm({ ...form, profitBeforeTax: e.target.value })} /></div>
            <div><Label>Taxable Income</Label><Input type="number" value={form.taxableIncome || ''} onChange={e => setForm({ ...form, taxableIncome: e.target.value })} /></div>
            <div><Label>Tax at Normal Rate</Label><Input type="number" value={form.taxAtNormalRate || ''} onChange={e => setForm({ ...form, taxAtNormalRate: e.target.value })} /></div>
            <div><Label>Surcharge</Label><Input type="number" value={form.surcharge || ''} onChange={e => setForm({ ...form, surcharge: e.target.value })} /></div>
            <div><Label>Education Cess</Label><Input type="number" value={form.educationCess || ''} onChange={e => setForm({ ...form, educationCess: e.target.value })} /></div>
            <div><Label>Total Tax Liability</Label><Input type="number" value={form.totalTaxLiability || ''} onChange={e => setForm({ ...form, totalTaxLiability: e.target.value })} /></div>
            <div><Label>Effective Tax Payable</Label><Input type="number" value={form.effectiveTaxPayable || ''} onChange={e => setForm({ ...form, effectiveTaxPayable: e.target.value })} /></div>
            <div><Label>TDS Receivable</Label><Input type="number" value={form.tdsReceivable || ''} onChange={e => setForm({ ...form, tdsReceivable: e.target.value })} /></div>
            <div><Label>Advance Tax Paid</Label><Input type="number" value={form.advanceTaxPaid || ''} onChange={e => setForm({ ...form, advanceTaxPaid: e.target.value })} /></div>
            <div><Label>Self Assessment Tax Paid</Label><Input type="number" value={form.selfAssessmentTaxPaid || ''} onChange={e => setForm({ ...form, selfAssessmentTaxPaid: e.target.value })} /></div>
            <div><Label>Net Tax Payable</Label><Input type="number" value={form.netTaxPayable || ''} onChange={e => setForm({ ...form, netTaxPayable: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.matApplicable || false} onChange={e => setForm({ ...form, matApplicable: e.target.checked })} />
              <Label>MAT Applicable</Label>
            </div>
            {form.matApplicable && (
              <div><Label>MAT Amount</Label><Input type="number" value={form.matAmount || ''} onChange={e => setForm({ ...form, matAmount: e.target.value })} /></div>
            )}
          </div>

          <div className="mt-4">
            <Label className="text-base font-semibold">Book-to-Tax Adjustments</Label>
            <div className="space-y-2 mt-2">
              {adjustmentRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4"><Input value={row.description} onChange={e => { const r = [...adjustmentRows]; r[idx].description = e.target.value; setAdjustmentRows(r); }} placeholder="Description" /></div>
                  <div className="col-span-2">
                    <Select value={row.type} onValueChange={v => { const r = [...adjustmentRows]; r[idx].type = v; setAdjustmentRows(r); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add_back">Add Back</SelectItem>
                        <SelectItem value="deduction">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Input value={row.section} onChange={e => { const r = [...adjustmentRows]; r[idx].section = e.target.value; setAdjustmentRows(r); }} placeholder="Section" /></div>
                  <div className="col-span-3"><Input type="number" value={row.amount} onChange={e => { const r = [...adjustmentRows]; r[idx].amount = e.target.value; setAdjustmentRows(r); }} placeholder="Amount" /></div>
                  <div className="col-span-1">
                    {adjustmentRows.length > 1 && <Button variant="ghost" size="sm" onClick={() => setAdjustmentRows(adjustmentRows.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setAdjustmentRows([...adjustmentRows, { description: '', type: 'add_back', section: '', amount: '' }])}>
                <Plus className="h-3 w-3 mr-1" /> Add Row
              </Button>
            </div>
          </div>

          <div className="mt-2"><Label>Notes</Label><Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating...' : 'Create Estimate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdvanceTaxTab({ advanceTax, selectedTaxYearId, selectedTaxYear, invalidateAll, toast }: any) {
  const initMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/company-tax/advance-tax/initialize', {
        taxYearId: selectedTaxYearId,
        financialYear: selectedTaxYear?.financialYear,
      });
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Advance tax installments initialized' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Advance Tax Installments</h3>
        {advanceTax.length === 0 && (
          <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
            <Calculator className="h-4 w-4 mr-1" /> Initialize Installments
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Installment</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">Cum. %</TableHead>
            <TableHead className="text-right">Estimated Liability</TableHead>
            <TableHead className="text-right">Amount Due</TableHead>
            <TableHead className="text-right">Amount Paid</TableHead>
            <TableHead>Payment Date</TableHead>
            <TableHead className="text-right">Int. 234C</TableHead>
            <TableHead className="text-right">Int. 234B</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {advanceTax.map((inst: any) => (
            <TableRow key={inst.id}>
              <TableCell className="font-medium">{inst.installment}</TableCell>
              <TableCell>{formatDate(inst.dueDate)}</TableCell>
              <TableCell className="text-right">{inst.cumulativePercent}%</TableCell>
              <TableCell className="text-right">₹{fmt(inst.estimatedLiability)}</TableCell>
              <TableCell className="text-right">₹{fmt(inst.amountDue)}</TableCell>
              <TableCell className="text-right">₹{fmt(inst.amountPaid)}</TableCell>
              <TableCell>{formatDate(inst.paymentDate)}</TableCell>
              <TableCell className="text-right">₹{fmt(inst.interest234c)}</TableCell>
              <TableCell className="text-right">₹{fmt(inst.interest234b)}</TableCell>
              <TableCell>{statusBadge(inst.status)}</TableCell>
            </TableRow>
          ))}
          {advanceTax.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Click 'Initialize Installments' to set up Q1-Q4</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ProvisionsTab({ provisions, selectedTaxYearId, showDialog, setShowDialog, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({});

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/provisions', data);
    },
    onSuccess: () => { invalidateAll(); setShowDialog(false); toast({ title: 'Provision created' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const reverseMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('PUT', `/api/company-tax/provisions/${id}/reverse`, {});
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Provision reversed' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const postSapMutation = useMutation({
    mutationFn: async ({ id, sapJeReference }: { id: number; sapJeReference: string }) => {
      return await apiRequest('PUT', `/api/company-tax/provisions/${id}/post-sap`, { sapJeReference });
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Posted to SAP' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tax Provisions</h3>
        <Button onClick={() => { setForm({}); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Provision
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Cumulative</TableHead>
            <TableHead>SAP JE</TableHead>
            <TableHead>Reversal Ref</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {provisions.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell>{formatDate(p.provisionDate)}</TableCell>
              <TableCell>{p.provisionPeriod || '-'}</TableCell>
              <TableCell>{p.provisionType || '-'}</TableCell>
              <TableCell className="text-right">₹{fmt(p.amount)}</TableCell>
              <TableCell className="text-right">₹{fmt(p.cumulativeProvision)}</TableCell>
              <TableCell>{p.sapJeReference || '-'}</TableCell>
              <TableCell>{p.adjustmentReference || (p.reversedProvisionId ? `Rev. of #${p.reversedProvisionId}` : '-')}</TableCell>
              <TableCell>{statusBadge(p.postingStatus)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {p.postingStatus === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const je = prompt('Enter SAP JE Reference:');
                      if (je) postSapMutation.mutate({ id: p.id, sapJeReference: je });
                    }}>Post SAP</Button>
                  )}
                  {p.postingStatus === 'posted' && !p.reversedProvisionId && (
                    <Button size="sm" variant="outline" onClick={() => reverseMutation.mutate(p.id)}>Reverse</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {provisions.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No provisions yet</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Tax Provision</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Provision Period</Label><Input value={form.provisionPeriod || ''} onChange={e => setForm({ ...form, provisionPeriod: e.target.value })} placeholder="e.g., Q2-2025, Mar-2026" /></div>
            <div>
              <Label>Provision Type</Label>
              <Select value={form.provisionType || ''} onValueChange={v => setForm({ ...form, provisionType: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_tax">Current Tax</SelectItem>
                  <SelectItem value="deferred_tax">Deferred Tax</SelectItem>
                  <SelectItem value="mat_credit">MAT Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Cumulative Provision</Label><Input type="number" value={form.cumulativeProvision || ''} onChange={e => setForm({ ...form, cumulativeProvision: e.target.value })} /></div>
            <div><Label>Adjustment Reference</Label><Input value={form.adjustmentReference || ''} onChange={e => setForm({ ...form, adjustmentReference: e.target.value })} placeholder="Optional reference" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, taxYearId: selectedTaxYearId, provisionDate: new Date().toISOString() })} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Provision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChallansTab({ challans, selectedTaxYearId, showDialog, setShowDialog, showPaymentDialog, setShowPaymentDialog, selectedChallan, setSelectedChallan, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({});
  const [paymentForm, setPaymentForm] = useState<any>({});

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/challans', data);
    },
    onSuccess: () => { invalidateAll(); setShowDialog(false); toast({ title: 'Challan created' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PUT', `/api/company-tax/challans/${selectedChallan.id}/payment`, data);
    },
    onSuccess: () => { invalidateAll(); setShowPaymentDialog(false); toast({ title: 'Payment recorded' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const postSapMutation = useMutation({
    mutationFn: async ({ id, sapJeReference }: { id: number; sapJeReference: string }) => {
      return await apiRequest('PUT', `/api/company-tax/challans/${id}/post-sap`, { sapJeReference });
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Posted to SAP' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tax Challans & Payments</h3>
        <Button onClick={() => { setForm({}); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Challan
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Challan No</TableHead>
            <TableHead className="text-right">Tax</TableHead>
            <TableHead className="text-right">Surcharge</TableHead>
            <TableHead className="text-right">Cess</TableHead>
            <TableHead className="text-right">Interest</TableHead>
            <TableHead className="text-right">Penalty</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>SAP JE</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {challans.map((c: any) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.challanReference}</TableCell>
              <TableCell>{c.paymentType?.replace(/_/g, ' ')}</TableCell>
              <TableCell>{c.challanNo}</TableCell>
              <TableCell className="text-right">₹{fmt(c.taxAmount)}</TableCell>
              <TableCell className="text-right">₹{fmt(c.surchargeAmount)}</TableCell>
              <TableCell className="text-right">₹{fmt(c.cessAmount)}</TableCell>
              <TableCell className="text-right">₹{fmt(c.interestAmount)}</TableCell>
              <TableCell className="text-right">₹{fmt(c.penaltyAmount)}</TableCell>
              <TableCell className="text-right font-medium">₹{fmt(c.totalAmount)}</TableCell>
              <TableCell>{formatDate(c.paymentDate)}</TableCell>
              <TableCell>{c.sapJeReference || '-'}</TableCell>
              <TableCell>{statusBadge(c.status)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {c.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => { setSelectedChallan(c); setPaymentForm({}); setShowPaymentDialog(true); }}>Pay</Button>
                  )}
                  {c.status === 'paid' && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const je = prompt('Enter SAP JE Reference:');
                      if (je) postSapMutation.mutate({ id: c.id, sapJeReference: je });
                    }}>Post SAP</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {challans.length === 0 && (
            <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No challans yet</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Tax Challan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Payment Type</Label>
              <Select value={form.paymentType || ''} onValueChange={v => setForm({ ...form, paymentType: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance_tax">Advance Tax</SelectItem>
                  <SelectItem value="self_assessment_tax">Self Assessment Tax</SelectItem>
                  <SelectItem value="regular_assessment_tax">Regular Assessment Tax</SelectItem>
                  <SelectItem value="demand_payment">Demand Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tax Amount</Label><Input type="number" value={form.taxAmount || ''} onChange={e => setForm({ ...form, taxAmount: e.target.value })} /></div>
              <div><Label>Surcharge</Label><Input type="number" value={form.surchargeAmount || ''} onChange={e => setForm({ ...form, surchargeAmount: e.target.value })} /></div>
              <div><Label>Cess</Label><Input type="number" value={form.cessAmount || ''} onChange={e => setForm({ ...form, cessAmount: e.target.value })} /></div>
              <div><Label>Interest (234A/B/C)</Label><Input type="number" value={form.interestAmount || ''} onChange={e => setForm({ ...form, interestAmount: e.target.value })} /></div>
              <div><Label>Penalty</Label><Input type="number" value={form.penaltyAmount || ''} onChange={e => setForm({ ...form, penaltyAmount: e.target.value })} /></div>
              <div>
                <Label>Total Amount</Label>
                <Input type="number" value={form.totalAmount || ''} onChange={e => setForm({ ...form, totalAmount: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, taxYearId: selectedTaxYearId })} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Challan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Payment Date</Label><Input type="date" value={paymentForm.paymentDate || ''} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} /></div>
            <div><Label>Payment Mode</Label>
              <Select value={paymentForm.paymentMode || ''} onValueChange={v => setPaymentForm({ ...paymentForm, paymentMode: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="neft">NEFT</SelectItem>
                  <SelectItem value="rtgs">RTGS</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>BSR Code</Label><Input value={paymentForm.bsrCode || ''} onChange={e => setPaymentForm({ ...paymentForm, bsrCode: e.target.value })} /></div>
            <div><Label>CIN Number</Label><Input value={paymentForm.cinNumber || ''} onChange={e => setPaymentForm({ ...paymentForm, cinNumber: e.target.value })} /></div>
            <div><Label>Payment Reference</Label><Input value={paymentForm.paymentReference || ''} onChange={e => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })} /></div>
            <div><Label>Bank Name</Label><Input value={paymentForm.bankName || ''} onChange={e => setPaymentForm({ ...paymentForm, bankName: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button onClick={() => paymentMutation.mutate(paymentForm)} disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReturnsTab({ returns, selectedTaxYearId, showDialog, setShowDialog, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({});

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/returns', data);
    },
    onSuccess: () => { invalidateAll(); setShowDialog(false); toast({ title: 'Return record created' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PUT', `/api/company-tax/returns/${id}`, data);
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Return updated' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Income Tax Returns</h3>
        <Button onClick={() => { setForm({}); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Return
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Form</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Filing Date</TableHead>
            <TableHead>Acknowledgement</TableHead>
            <TableHead className="text-right">Income Reported</TableHead>
            <TableHead className="text-right">Tax Payable</TableHead>
            <TableHead className="text-right">Tax Paid</TableHead>
            <TableHead className="text-right">Int. 234A</TableHead>
            <TableHead className="text-right">Int. 234B</TableHead>
            <TableHead className="text-right">Int. 234C</TableHead>
            <TableHead className="text-right">Refund</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {returns.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{r.returnType}</TableCell>
              <TableCell>{r.formType}</TableCell>
              <TableCell>{formatDate(r.dueDate)}</TableCell>
              <TableCell>{formatDate(r.filingDate)}</TableCell>
              <TableCell>{r.acknowledgementNumber || '-'}</TableCell>
              <TableCell className="text-right">₹{fmt(r.totalIncomeReported)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.totalTaxPayable)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.totalTaxPaid)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.interest234a)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.interest234b)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.interest234c)}</TableCell>
              <TableCell className="text-right">₹{fmt(r.refundClaimed)}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
            </TableRow>
          ))}
          {returns.length === 0 && (
            <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No returns filed yet</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add Income Tax Return</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Return Type</Label>
              <Select value={form.returnType || ''} onValueChange={v => setForm({ ...form, returnType: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original</SelectItem>
                  <SelectItem value="revised">Revised</SelectItem>
                  <SelectItem value="belated">Belated</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Due Date</Label><Input type="date" value={form.dueDate || ''} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><Label>Filing Date</Label><Input type="date" value={form.filingDate || ''} onChange={e => setForm({ ...form, filingDate: e.target.value })} /></div>
            <div><Label>Acknowledgement Number</Label><Input value={form.acknowledgementNumber || ''} onChange={e => setForm({ ...form, acknowledgementNumber: e.target.value })} /></div>
            <div><Label>Total Income Reported</Label><Input type="number" value={form.totalIncomeReported || ''} onChange={e => setForm({ ...form, totalIncomeReported: e.target.value })} /></div>
            <div><Label>Total Tax Payable</Label><Input type="number" value={form.totalTaxPayable || ''} onChange={e => setForm({ ...form, totalTaxPayable: e.target.value })} /></div>
            <div><Label>Total Tax Paid</Label><Input type="number" value={form.totalTaxPaid || ''} onChange={e => setForm({ ...form, totalTaxPaid: e.target.value })} /></div>
            <div><Label>Interest 234A</Label><Input type="number" value={form.interest234a || ''} onChange={e => setForm({ ...form, interest234a: e.target.value })} /></div>
            <div><Label>Interest 234B</Label><Input type="number" value={form.interest234b || ''} onChange={e => setForm({ ...form, interest234b: e.target.value })} /></div>
            <div><Label>Interest 234C</Label><Input type="number" value={form.interest234c || ''} onChange={e => setForm({ ...form, interest234c: e.target.value })} /></div>
            <div><Label>Refund Claimed</Label><Input type="number" value={form.refundClaimed || ''} onChange={e => setForm({ ...form, refundClaimed: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || 'pending'} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="filed">Filed</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="refund_issued">Refund Issued</SelectItem>
                  <SelectItem value="demand_raised">Demand Raised</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Remarks</Label><Textarea value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              const totalInterest = (parseFloat(form.interest234a || 0) + parseFloat(form.interest234b || 0) + parseFloat(form.interest234c || 0)).toFixed(2);
              createMutation.mutate({ ...form, taxYearId: selectedTaxYearId, totalInterest });
            }} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Add Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReconciliationTab({ reconciliation, selectedTaxYearId }: any) {
  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;
  if (!reconciliation) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading reconciliation data...</CardContent></Card>;

  const r = reconciliation;

  function varianceBadge(type: string, value: number | null) {
    if (value === null || value === undefined) return <Badge className="bg-gray-100 text-gray-600">N/A</Badge>;
    const colors: Record<string, { pos: string; zero: string; neg: string }> = {
      estimate_variance: { pos: 'bg-blue-100 text-blue-800', zero: 'bg-green-100 text-green-800', neg: 'bg-blue-100 text-blue-800' },
      payment_mismatch: { pos: 'bg-green-100 text-green-800', zero: 'bg-green-100 text-green-800', neg: 'bg-red-100 text-red-800' },
      timing_difference: { pos: 'bg-yellow-100 text-yellow-800', zero: 'bg-green-100 text-green-800', neg: 'bg-yellow-100 text-yellow-800' },
      posting_mismatch: { pos: 'bg-red-100 text-red-800', zero: 'bg-green-100 text-green-800', neg: 'bg-red-100 text-red-800' },
    };
    const c = colors[type] || colors.posting_mismatch;
    const cls = value === 0 ? c.zero : value > 0 ? c.pos : c.neg;
    return <Badge className={cls}>₹{fmt(Math.abs(value))}</Badge>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Reconciliation</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> Estimate vs Return</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Estimated Tax Liability</span><span className="font-medium">₹{fmt(r.estimatedLiability)}</span></div>
            <div className="flex justify-between"><span>Tax per Return (ITR)</span><span className="font-medium">₹{fmt(r.taxPerReturn)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-medium">Estimate Variance</span>{varianceBadge('estimate_variance', r.estimateVariance)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Payment Reconciliation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Advance Tax Paid</span><span className="font-medium">₹{fmt(r.advanceTaxPaid)}</span></div>
            <div className="flex justify-between"><span>Self Assessment Tax Paid</span><span className="font-medium">₹{fmt(r.selfAssessmentPaid)}</span></div>
            <div className="flex justify-between"><span>TDS Credits</span><span className="font-medium">₹{fmt(r.tdsCredits)}</span></div>
            <div className="flex justify-between border-t pt-1"><span>Total Tax Paid</span><span className="font-medium">₹{fmt(r.totalTaxPaid)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-medium">Payment Mismatch</span>{varianceBadge('payment_mismatch', r.paymentMismatch)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4" /> Timing Difference</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Total Provisions Booked</span><span className="font-medium">₹{fmt(r.totalProvisions)}</span></div>
            <div className="flex justify-between"><span>Actual Liability</span><span className="font-medium">₹{fmt(r.taxPerReturn || r.estimatedLiability)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-medium">Timing Difference</span>{varianceBadge('timing_difference', r.timingDifference)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> SAP Posting</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Challans Posted to SAP</span><span className="font-medium">₹{fmt(r.challansPostedToSap)}</span></div>
            <div className="flex justify-between"><span>Provisions Posted to SAP</span><span className="font-medium">₹{fmt(r.provisionsPostedToSap)}</span></div>
            <div className="flex justify-between border-t pt-1"><span>Total SAP Postings</span><span className="font-medium">₹{fmt(r.totalSapPostings)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-medium">Posting Mismatch</span>{varianceBadge('posting_mismatch', r.postingMismatch)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NoticesTab({ notices, selectedTaxYearId, showDialog, setShowDialog, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({});

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/notices', data);
    },
    onSuccess: () => { invalidateAll(); setShowDialog(false); toast({ title: 'Notice recorded' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PUT', `/api/company-tax/notices/${id}`, data);
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Notice updated' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!selectedTaxYearId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Select an Assessment Year first</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tax Notices (Register)</h3>
        <Button onClick={() => { setForm({}); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Notice
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Notice Date</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead className="text-right">Demand Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notices.map((n: any) => (
            <TableRow key={n.id}>
              <TableCell>{n.noticeType?.replace(/_/g, ' ') || '-'}</TableCell>
              <TableCell>{formatDate(n.noticeDate)}</TableCell>
              <TableCell>{formatDate(n.dueDate)}</TableCell>
              <TableCell className="text-right">₹{fmt(n.demandAmount)}</TableCell>
              <TableCell>{statusBadge(n.status)}</TableCell>
              <TableCell className="max-w-[200px] truncate">{n.remarks || '-'}</TableCell>
              <TableCell>
                {n.status === 'received' && (
                  <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: n.id, data: { status: 'response_filed' } })}>
                    Mark Responded
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {notices.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No notices recorded</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Tax Notice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Notice Type</Label>
              <Select value={form.noticeType || ''} onValueChange={v => setForm({ ...form, noticeType: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intimation_143_1">Intimation u/s 143(1)</SelectItem>
                  <SelectItem value="scrutiny_143_2">Scrutiny u/s 143(2)</SelectItem>
                  <SelectItem value="demand_156">Demand u/s 156</SelectItem>
                  <SelectItem value="rectification_154">Rectification u/s 154</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notice Date</Label><Input type="date" value={form.noticeDate || ''} onChange={e => setForm({ ...form, noticeDate: e.target.value })} /></div>
            <div><Label>Due Date</Label><Input type="date" value={form.dueDate || ''} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><Label>Demand Amount</Label><Input type="number" value={form.demandAmount || ''} onChange={e => setForm({ ...form, demandAmount: e.target.value })} /></div>
            <div><Label>Remarks</Label><Textarea value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ ...form, taxYearId: selectedTaxYearId })} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Record Notice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaxYearDialog({ open, onClose, invalidateAll, toast }: any) {
  const [form, setForm] = useState<any>({ cessRate: '4', status: 'active' });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/company-tax/tax-years', data);
    },
    onSuccess: () => { invalidateAll(); onClose(); toast({ title: 'Tax year created' }); setForm({ cessRate: '4', status: 'active' }); },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Assessment Year</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Assessment Year</Label><Input value={form.assessmentYear || ''} onChange={e => setForm({ ...form, assessmentYear: e.target.value })} placeholder="AY 2026-27" /></div>
            <div><Label>Financial Year</Label><Input value={form.financialYear || ''} onChange={e => setForm({ ...form, financialYear: e.target.value })} placeholder="2025-26" /></div>
          </div>
          <div><Label>Company PAN</Label><Input value={form.companyPan || ''} onChange={e => setForm({ ...form, companyPan: e.target.value })} /></div>
          <div>
            <Label>Tax Regime</Label>
            <Select value={form.taxRegime || ''} onValueChange={v => setForm({ ...form, taxRegime: v })}>
              <SelectTrigger><SelectValue placeholder="Select regime" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="old">Old Regime</SelectItem>
                <SelectItem value="new_115BAA">New Regime (115BAA)</SelectItem>
                <SelectItem value="new_115BAB">New Regime (115BAB)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Base Tax Rate (%)</Label><Input type="number" value={form.baseTaxRate || ''} onChange={e => setForm({ ...form, baseTaxRate: e.target.value })} placeholder="22" /></div>
            <div><Label>Surcharge Rate (%)</Label><Input type="number" value={form.surchargeRate || ''} onChange={e => setForm({ ...form, surchargeRate: e.target.value })} placeholder="10" /></div>
            <div><Label>Cess Rate (%)</Label><Input type="number" value={form.cessRate || '4'} onChange={e => setForm({ ...form, cessRate: e.target.value })} /></div>
          </div>
          <div><Label>Surcharge Policy</Label><Textarea value={form.surchargePolicy || ''} onChange={e => setForm({ ...form, surchargePolicy: e.target.value })} placeholder="e.g., 10% if income > 1Cr, 12% if > 10Cr" /></div>
          <div>
            <Label>Effective Rate (%) — informational snapshot</Label>
            <Input type="number" value={form.effectiveRate || ''} onChange={e => setForm({ ...form, effectiveRate: e.target.value })} placeholder="e.g., 25.168" />
          </div>
          <div><Label>Rate Override Notes</Label><Textarea value={form.rateOverrideNotes || ''} onChange={e => setForm({ ...form, rateOverrideNotes: e.target.value })} placeholder="Any override justification" /></div>
          <div><Label>Remarks</Label><Textarea value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Tax Year'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}