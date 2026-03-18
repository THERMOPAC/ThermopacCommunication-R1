import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Pencil, Landmark, Search } from "lucide-react";
import Layout from "@/components/layout";

const COMPONENTS = [
  { code: 'BASIC', name: 'Basic Salary', category: 'earning' },
  { code: 'HRA', name: 'House Rent Allowance', category: 'earning' },
  { code: 'CONVEYANCE', name: 'Conveyance Allowance', category: 'earning' },
  { code: 'LTA', name: 'Leave Travel Allowance', category: 'earning' },
  { code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', category: 'earning' },
  { code: 'SUPPLEMENTARY', name: 'Supplementary Allowance', category: 'earning' },
  { code: 'KGP', name: 'KPI Growth Pay', category: 'earning' },
  { code: 'BONUS', name: 'Bonus', category: 'earning' },
  { code: 'OVERTIME', name: 'Overtime Pay', category: 'earning' },
  { code: 'OTHER_ALLOWANCES', name: 'Other Allowances', category: 'earning' },
  { code: 'PF_EMPLOYEE', name: 'Employee PF Contribution', category: 'deduction' },
  { code: 'ESIC_EMPLOYEE', name: 'Employee ESIC', category: 'deduction' },
  { code: 'PT', name: 'Professional Tax', category: 'statutory' },
  { code: 'TDS', name: 'Tax Deducted at Source', category: 'statutory' },
  { code: 'LOAN_DEDUCTION', name: 'Loan EMI Recovery', category: 'deduction' },
  { code: 'ADVANCE_DEDUCTION', name: 'Advance Recovery', category: 'deduction' },
  { code: 'OTHER_DEDUCTIONS', name: 'Other Deductions', category: 'deduction' },
  { code: 'PF_EMPLOYER', name: 'Employer PF Contribution', category: 'employer_contribution' },
  { code: 'ESIC_EMPLOYER', name: 'Employer ESIC', category: 'employer_contribution' },
  { code: 'GRATUITY', name: 'Gratuity Provision', category: 'employer_contribution' },
  { code: 'GROUP_INSURANCE', name: 'Group Insurance', category: 'employer_contribution' },
  { code: 'EMPLOYEE_PAYABLE', name: 'Employee Payable (Net Salary)', category: 'employee_payable' },
  { code: 'TDS_INTEREST', name: 'TDS Interest (Late Deposit)', category: 'statutory_penalty' },
  { code: 'TDS_PENALTY', name: 'TDS Penalty', category: 'statutory_penalty' },
  { code: 'TDS_LATE_FEE', name: 'TDS Late Filing Fee (234E)', category: 'statutory_penalty' },
  { code: 'PF_ADMIN_CHARGES', name: 'PF Admin Charges (0.5%)', category: 'employer_contribution' },
  { code: 'EDLI_CONTRIBUTION', name: 'EDLI Contribution (0.5%)', category: 'employer_contribution' },
  { code: 'EDLI_ADMIN_CHARGES', name: 'EDLI Admin Charges', category: 'employer_contribution' },
  { code: 'PF_INTEREST', name: 'PF Interest (Late Deposit)', category: 'statutory_penalty' },
  { code: 'PF_PENALTY', name: 'PF Penalty / Damages', category: 'statutory_penalty' },
  { code: 'ESIC_INTEREST', name: 'ESIC Interest (Late Deposit)', category: 'statutory_penalty' },
  { code: 'ESIC_PENALTY', name: 'ESIC Penalty', category: 'statutory_penalty' },
  { code: 'PT_INTEREST', name: 'PT Interest (Late Payment)', category: 'statutory_penalty' },
  { code: 'PT_PENALTY', name: 'PT Penalty', category: 'statutory_penalty' },
  { code: 'CIT_CURRENT_TAX_EXPENSE', name: 'Current Tax Expense', category: 'company_tax' },
  { code: 'CIT_DEFERRED_TAX', name: 'Deferred Tax Expense/Benefit', category: 'company_tax' },
  { code: 'CIT_TAX_PROVISION', name: 'Income Tax Provision', category: 'company_tax' },
  { code: 'CIT_PROVISION_OFFSET', name: 'Provision Offset (Year-End Adjustment)', category: 'company_tax' },
  { code: 'CIT_ADVANCE_TAX', name: 'Advance Tax Paid', category: 'company_tax' },
  { code: 'CIT_TDS_RECEIVABLE', name: 'TDS Receivable (Tax Credits)', category: 'company_tax' },
  { code: 'CIT_TAX_REFUND', name: 'Tax Refund Receivable', category: 'company_tax' },
  { code: 'CIT_INTEREST_234B', name: 'Interest u/s 234B (Advance Tax Default)', category: 'company_tax_penalty' },
  { code: 'CIT_INTEREST_234C', name: 'Interest u/s 234C (Deferment)', category: 'company_tax_penalty' },
  { code: 'CIT_INTEREST_234A', name: 'Interest u/s 234A (Late Filing)', category: 'company_tax_penalty' },
  { code: 'CIT_TAX_PENALTY', name: 'Income Tax Penalty', category: 'company_tax_penalty' },
];

const CONTEXTS = [
  { value: 'payroll_liability', label: 'Payroll Liability' },
  { value: 'statutory_payment', label: 'Statutory Payment' },
  { value: 'tax_liability', label: 'Tax Liability' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'expense', label: 'Expense' },
];

const CATEGORIES = [
  { value: 'earning', label: 'Earnings', color: 'bg-green-100 text-green-800' },
  { value: 'deduction', label: 'Deductions', color: 'bg-red-100 text-red-800' },
  { value: 'statutory', label: 'Statutory', color: 'bg-blue-100 text-blue-800' },
  { value: 'employer_contribution', label: 'Employer Contributions', color: 'bg-purple-100 text-purple-800' },
  { value: 'employee_payable', label: 'Employee Payable', color: 'bg-orange-100 text-orange-800' },
  { value: 'statutory_penalty', label: 'Statutory Penalty / Interest', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'company_tax', label: 'Company Income Tax', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'company_tax_penalty', label: 'Company Tax Penalty / Interest', color: 'bg-rose-100 text-rose-800' },
];

const CATEGORY_ORDER = ['earning', 'deduction', 'statutory', 'employer_contribution', 'employee_payable', 'statutory_penalty', 'company_tax', 'company_tax_penalty'];


export default function GlMappingPage() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterContext, setFilterContext] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [form, setForm] = useState({ glAccountCode: '', glAccountName: '' });

  const { data: user } = useQuery<any>({ queryKey: ['/api/user'] });
  const isAdmin = user?.role === 'Superuser' || user?.role === 'Manager';

  const { data: mappings = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/statutory/gl-mappings'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/statutory/gl-mappings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] });
      setShowDialog(false);
      toast({ title: 'GL Mapping updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });


  function openEdit(m: any) {
    setEditId(m.id);
    setEditRow(m);
    setForm({ glAccountCode: m.glAccountCode || '', glAccountName: m.glAccountName || '' });
    setShowDialog(true);
  }

  function handleSave() {
    if (!editId) return;
    updateMutation.mutate({
      id: editId,
      glAccountCode: form.glAccountCode,
      glAccountName: form.glAccountName,
      debitCredit: editRow?.debitCredit,
      isActive: true,
    });
  }

  const isMapped = (m: any) => m.glAccountCode && m.glAccountCode.trim() !== '';

  const filtered = mappings.filter((m: any) => {
    if (filterCategory !== 'all' && m.category !== filterCategory) return false;
    if (filterContext !== 'all' && m.postingContext !== filterContext) return false;
    if (filterStatus === 'mapped' && !isMapped(m)) return false;
    if (filterStatus === 'unmapped' && isMapped(m)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a: any, b: any) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.componentCode.localeCompare(b.componentCode);
  });

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: sorted.filter((m: any) => m.category === cat.value),
  })).filter(g => g.items.length > 0);

  const totalMapped = mappings.filter((m: any) => isMapped(m)).length;
  const totalUnmapped = mappings.filter((m: any) => !isMapped(m)).length;

  const codeCounts: Record<string, number> = {};
  mappings.forEach((m: any) => { codeCounts[m.componentCode] = (codeCounts[m.componentCode] || 0) + 1; });
  const isDuplicate = (code: string) => (codeCounts[code] || 0) > 1;

  const contextShortLabel = (ctx: string) => {
    if (ctx === 'expense') return 'Expense';
    if (ctx === 'payroll_liability') return 'Liability';
    if (ctx === 'tax_liability') return 'Tax Liability';
    if (ctx === 'recovery') return 'Recovery';
    if (ctx === 'statutory_payment') return 'Statutory Pmt';
    return ctx;
  };

  const unmappedLabels = mappings
    .filter((m: any) => !isMapped(m))
    .map((m: any) => isDuplicate(m.componentCode)
      ? `${m.componentName} (${contextShortLabel(m.postingContext)} – ${m.debitCredit === 'debit' ? 'Dr' : 'Cr'})`
      : m.componentName
    );

  const catBadge = (cat: string) => {
    const c = CATEGORIES.find(x => x.value === cat);
    return c ? <Badge className={c.color}>{c.label}</Badge> : <Badge>{cat}</Badge>;
  };

  const contextLabel = (ctx: string) => CONTEXTS.find(c => c.value === ctx)?.label || ctx;

  return (
    <Layout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark className="h-6 w-6" /> GL Account Mapping</h1>
          <p className="text-muted-foreground mt-1">Centralized GL mapping for all payroll and statutory modules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{mappings.length}</div>
            <div className="text-sm text-muted-foreground">Total Components</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{totalMapped}</div>
            <div className="text-sm text-muted-foreground">Mapped (GL Code Assigned)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{totalUnmapped}</div>
            <div className="text-sm text-muted-foreground">Unmapped (Needs GL Code)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{new Set(mappings.map((m: any) => m.category)).size}</div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
      </div>

      {totalUnmapped > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-800">{totalUnmapped} component{totalUnmapped > 1 ? 's' : ''} missing GL account code</h4>
                <p className="text-sm text-amber-700 mt-1">
                  SAP posting will be blocked for any JE that uses these unmapped components: {unmappedLabels.join(', ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 flex-wrap">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Filter by Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterContext} onValueChange={setFilterContext}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Filter by Context" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            {CONTEXTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Mapping Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="mapped">Mapped Only</SelectItem>
            <SelectItem value="unmapped">Unmapped Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-10">Loading...</div>
      ) : mappings.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No GL Mappings Found</h3>
            <p className="text-muted-foreground mt-2">
              {isAdmin
                ? 'Click "Seed Payroll GL Mappings" above to create all 26 payroll component rows.'
                : 'Ask your administrator to seed the payroll GL mappings.'}
            </p>
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Results</h3>
            <p className="text-muted-foreground mt-2">No mappings match the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        grouped.map(group => (
          <Card key={group.value}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Badge className={group.color}>{group.label}</Badge>
                <span className="text-sm text-muted-foreground">({group.items.length} mapping{group.items.length > 1 ? 's' : ''})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">Status</TableHead>
                    <TableHead>Component Code</TableHead>
                    <TableHead>Component Name</TableHead>
                    <TableHead>Posting Context</TableHead>
                    <TableHead>GL Account Code</TableHead>
                    <TableHead>GL Account Name</TableHead>
                    <TableHead>Dr/Cr</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((m: any) => (
                    <TableRow key={m.id} className={!isMapped(m) ? 'bg-amber-50/50' : ''}>
                      <TableCell>
                        {isMapped(m)
                          ? <CheckCircle className="h-4 w-4 text-green-600" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">{m.componentCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{m.componentName}</span>
                          {isDuplicate(m.componentCode) && (
                            <Badge variant="outline" className={
                              m.postingContext === 'expense'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-violet-50 text-violet-700 border-violet-200'
                            }>
                              {contextShortLabel(m.postingContext)} ({m.debitCredit === 'debit' ? 'Dr' : 'Cr'})
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{contextLabel(m.postingContext)}</Badge></TableCell>
                      <TableCell>
                        {isMapped(m)
                          ? <span className="font-mono">{m.glAccountCode}</span>
                          : <span className="text-amber-500 italic text-sm">Not assigned</span>}
                      </TableCell>
                      <TableCell>
                        {m.glAccountName
                          ? m.glAccountName
                          : <span className="text-muted-foreground italic text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.debitCredit === 'debit' ? 'default' : 'secondary'}>
                          {m.debitCredit === 'debit' ? 'Dr' : 'Cr'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit GL Mapping</DialogTitle>
            <DialogDescription>Update the SAP B1 GL account code and name for this component.</DialogDescription>
          </DialogHeader>
          {editRow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Component Code</label>
                  <p className="font-mono text-sm font-medium">{editRow.componentCode}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Component Name</label>
                  <p className="text-sm">{editRow.componentName}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <p className="text-sm">{catBadge(editRow.category)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Posting Context</label>
                  <p className="text-sm">{contextLabel(editRow.postingContext)}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Debit / Credit</label>
                  <p className="text-sm">
                    <Badge variant={editRow.debitCredit === 'debit' ? 'default' : 'secondary'}>
                      {editRow.debitCredit === 'debit' ? 'Debit' : 'Credit'}
                    </Badge>
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">GL Account Code (SAP B1)</label>
                <Input
                  value={form.glAccountCode}
                  onChange={e => setForm(f => ({ ...f, glAccountCode: e.target.value }))}
                  placeholder="Enter SAP B1 GL account code"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">GL Account Name</label>
                <Input
                  value={form.glAccountName}
                  onChange={e => setForm(f => ({ ...f, glAccountName: e.target.value }))}
                  placeholder="Enter GL account name"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
