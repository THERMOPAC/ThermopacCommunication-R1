import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Pencil, Landmark, Search, Database, Loader2, SeedlingIcon, Sprout, Check, X, RefreshCw, Link2, Shield } from "lucide-react";
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
  { code: 'NET_PAY', name: 'Net Salary Payable', category: 'net_pay' },
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
  { code: 'LOAN_RECEIVABLE', name: 'Loans to Employees (Asset)', category: 'loan_advance' },
  { code: 'ADVANCE_RECEIVABLE', name: 'Advances to Employees (Asset)', category: 'loan_advance' },
  { code: 'LOAN_ADVANCE_BANK', name: 'Bank / Cash (Disbursement)', category: 'loan_advance' },
];

const CONTEXTS = [
  { value: 'payroll_liability', label: 'Payroll Liability' },
  { value: 'statutory_payment', label: 'Statutory Payment' },
  { value: 'tax_liability', label: 'Tax Liability' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'expense', label: 'Expense' },
  { value: 'loan_disbursement', label: 'Loan Disbursement' },
  { value: 'advance_disbursement', label: 'Advance Disbursement' },
];

const CATEGORIES = [
  { value: 'earning', label: 'Earnings', color: 'bg-green-100 text-green-800' },
  { value: 'deduction', label: 'Deductions', color: 'bg-red-100 text-red-800' },
  { value: 'statutory', label: 'Statutory', color: 'bg-blue-100 text-blue-800' },
  { value: 'employer_contribution', label: 'Employer Contributions', color: 'bg-purple-100 text-purple-800' },
  { value: 'net_pay', label: 'Net Pay', color: 'bg-orange-100 text-orange-800' },
  { value: 'statutory_penalty', label: 'Statutory Penalty / Interest', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'company_tax', label: 'Company Income Tax', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'company_tax_penalty', label: 'Company Tax Penalty / Interest', color: 'bg-rose-100 text-rose-800' },
  { value: 'loan_advance', label: 'Loan & Advance Disbursement', color: 'bg-teal-100 text-teal-800' },
];

const CATEGORY_ORDER = ['earning', 'deduction', 'statutory', 'employer_contribution', 'net_pay', 'statutory_penalty', 'company_tax', 'company_tax_penalty', 'loan_advance'];

function InlineEditCell({ value, onSave, placeholder, className = '' }: { value: string; onSave: (v: string) => void; placeholder: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setEditVal(value);
    setEditing(true);
  }

  function save() {
    setEditing(false);
    if (editVal !== value) {
      onSave(editVal);
    }
  }

  function cancel() {
    setEditing(false);
    setEditVal(value);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          className="h-7 text-sm py-0 px-2"
          placeholder={placeholder}
        />
      </div>
    );
  }

  const isEmpty = !value || value.trim() === '';
  return (
    <div
      className={`cursor-pointer hover:bg-muted/50 rounded px-2 py-1 min-h-[28px] flex items-center group ${className}`}
      onClick={startEdit}
      title="Click to edit"
    >
      {isEmpty
        ? <span className="text-amber-500 italic text-sm">{placeholder}</span>
        : <span className="font-mono text-sm">{value}</span>}
      <Pencil className="h-3 w-3 ml-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}


export default function GlMappingPage() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterContext, setFilterContext] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [form, setForm] = useState({ glAccountCode: '', glAccountName: '' });
  const [sapAccounts, setSapAccounts] = useState<any[]>([]);
  const [sapLoading, setSapLoading] = useState(false);
  const [sapSearch, setSapSearch] = useState('');
  const [showSapSearch, setShowSapSearch] = useState(false);
  const [sapSearchQuery, setSapSearchQuery] = useState('');
  const [sapSearchResults, setSapSearchResults] = useState<any[]>([]);
  const [sapSearchLoading, setSapSearchLoading] = useState(false);
  const [sapSearchTarget, setSapSearchTarget] = useState<any>(null);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [showValidation, setShowValidation] = useState(false);

  const { data: user } = useQuery<any>({ queryKey: ['/api/user'] });
  const isAdmin = user?.role === 'Superuser' || user?.role === 'Manager';

  const { data: mappings = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/statutory/gl-mappings'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/statutory/gl-mappings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const seedAllMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/statutory/gl-mappings/seed-all'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] });
      toast({ title: 'GL Mappings Seeded', description: data.created > 0 ? `Created ${data.created} new mapping rows.` : 'All mappings already exist — nothing to seed.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const validateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/admin/payroll/validate-gl-mappings'),
    onSuccess: (data: any) => {
      setValidationResults(data);
      setShowValidation(true);
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] });
      const s = data.summary;
      toast({ title: 'GL Validation Complete', description: `${s.valid} valid, ${s.invalid} invalid, ${s.empty} empty of ${s.total} mappings` });
    },
    onError: (e: any) => toast({ title: 'Validation Failed', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const setSapCodeMutation = useMutation({
    mutationFn: ({ id, sapAcctCode, sapFormatCode, sapAcctName }: any) =>
      apiRequest('POST', `/api/admin/payroll/gl-mapping/${id}/set-sap-code`, { sapAcctCode, sapFormatCode, sapAcctName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] });
      toast({ title: 'SAP Account Code Linked' });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  function inlineSave(m: any, field: 'glAccountCode' | 'glAccountName', value: string) {
    updateMutation.mutate({
      id: m.id,
      glAccountCode: field === 'glAccountCode' ? value : m.glAccountCode,
      glAccountName: field === 'glAccountName' ? value : m.glAccountName,
      debitCredit: m.debitCredit,
      isActive: m.isActive,
    });
  }

  async function loadSapAccounts() {
    if (sapAccounts.length > 0) return;
    setSapLoading(true);
    try {
      const data = await apiRequest('GET', '/api/admin/payroll/sap-gl-accounts');
      setSapAccounts(data.accounts || []);
    } catch {
      setSapAccounts([]);
    } finally {
      setSapLoading(false);
    }
  }

  async function searchSapCoA(query: string) {
    if (query.length < 2) return;
    setSapSearchLoading(true);
    try {
      const data = await apiRequest('GET', `/api/admin/payroll/sap-coa-search?q=${encodeURIComponent(query)}`);
      setSapSearchResults(data.accounts || []);
    } catch {
      setSapSearchResults([]);
    } finally {
      setSapSearchLoading(false);
    }
  }

  function openSapSearch(targetMapping?: any) {
    setSapSearchTarget(targetMapping || null);
    setSapSearchQuery('');
    setSapSearchResults([]);
    setShowSapSearch(true);
  }

  function selectSapAccount(acct: any) {
    if (sapSearchTarget) {
      setSapCodeMutation.mutate({
        id: sapSearchTarget.id,
        sapAcctCode: acct.acctCode,
        sapFormatCode: acct.formatCode,
        sapAcctName: acct.acctName,
      });
      updateMutation.mutate({
        id: sapSearchTarget.id,
        glAccountCode: acct.formatCode || acct.acctCode,
        glAccountName: acct.acctName,
        debitCredit: sapSearchTarget.debitCredit,
        isActive: true,
      });
      setShowSapSearch(false);
    }
  }

  function openEdit(m: any) {
    setEditId(m.id);
    setEditRow(m);
    setForm({ glAccountCode: m.glAccountCode || '', glAccountName: m.glAccountName || '' });
    setSapSearch('');
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
    setShowDialog(false);
    toast({ title: 'GL Mapping updated' });
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

  const moduleStats = [
    { label: 'Payroll', cats: ['earning', 'deduction', 'statutory', 'employer_contribution', 'net_pay'] },
    { label: 'Statutory Penalty', cats: ['statutory_penalty'] },
    { label: 'Company Tax', cats: ['company_tax', 'company_tax_penalty'] },
  ].map(mod => {
    const modMappings = mappings.filter((m: any) => mod.cats.includes(m.category));
    const mapped = modMappings.filter((m: any) => isMapped(m)).length;
    return { ...mod, total: modMappings.length, mapped, unmapped: modMappings.length - mapped };
  });

  return (
    <Layout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark className="h-6 w-6" /> GL Account Mapping</h1>
          <p className="text-muted-foreground mt-1">Centralized GL mapping for all payroll and statutory modules</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button onClick={() => openSapSearch()} variant="outline" size="sm">
              <Search className="h-4 w-4 mr-2" /> Search SAP CoA
            </Button>
            <Button onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending} variant="outline" size="sm">
              {validateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Validate GL Mapping
            </Button>
            <Button onClick={() => seedAllMutation.mutate()} disabled={seedAllMutation.isPending} variant={mappings.length === 0 ? 'default' : 'outline'} size="sm">
              {seedAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sprout className="h-4 w-4 mr-2" />}
              {mappings.length === 0 ? 'Seed All' : 'Seed Missing'}
            </Button>
          </div>
        )}
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

      {moduleStats.length > 0 && mappings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {moduleStats.map(mod => (
            <Card key={mod.label} className={mod.unmapped > 0 ? 'border-amber-200' : 'border-green-200'}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{mod.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={mod.unmapped === 0 ? 'default' : 'outline'} className={mod.unmapped === 0 ? 'bg-green-600' : ''}>
                      {mod.mapped}/{mod.total}
                    </Badge>
                    {mod.unmapped > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    {mod.unmapped === 0 && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
                  </div>
                </div>
                <div className="mt-1.5 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${mod.unmapped === 0 ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${mod.total > 0 ? (mod.mapped / mod.total) * 100 : 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalUnmapped > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800">{totalUnmapped} component{totalUnmapped > 1 ? 's' : ''} missing GL account code</h4>
                <p className="text-sm text-amber-700 mt-1">
                  SAP posting will be blocked for any JE that uses unmapped components. Click any GL Account Code cell to assign it directly.
                </p>
                {unmappedLabels.length > 0 && unmappedLabels.length <= 15 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {unmappedLabels.map((label, i) => (
                      <Badge key={i} variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">{label}</Badge>
                    ))}
                  </div>
                )}
                {unmappedLabels.length > 15 && (
                  <p className="text-xs text-amber-600 mt-2">{unmappedLabels.length} unmapped — use "Unmapped Only" filter to see them all.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 flex-wrap items-center">
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
        {(filterCategory !== 'all' || filterContext !== 'all' || filterStatus !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterCategory('all'); setFilterContext('all'); setFilterStatus('all'); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-10"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></div>
      ) : mappings.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No GL Mappings Found</h3>
            <p className="text-muted-foreground mt-2 mb-4">
              {isAdmin
                ? 'Click the "Seed All GL Mappings" button to create all payroll, statutory and company tax component rows.'
                : 'Ask your administrator to seed the GL mappings.'}
            </p>
            {isAdmin && (
              <Button onClick={() => seedAllMutation.mutate()} disabled={seedAllMutation.isPending} size="lg">
                {seedAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sprout className="h-4 w-4 mr-2" />}
                Seed All GL Mappings
              </Button>
            )}
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
                <span className="text-sm text-muted-foreground">
                  ({group.items.filter((m: any) => isMapped(m)).length}/{group.items.length} mapped)
                </span>
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
                        {isAdmin ? (
                          <InlineEditCell
                            value={m.glAccountCode || ''}
                            onSave={(v) => inlineSave(m, 'glAccountCode', v)}
                            placeholder="Enter GL code"
                          />
                        ) : (
                          isMapped(m)
                            ? <span className="font-mono">{m.glAccountCode}</span>
                            : <span className="text-amber-500 italic text-sm">Not assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <InlineEditCell
                            value={m.glAccountName || ''}
                            onSave={(v) => inlineSave(m, 'glAccountName', v)}
                            placeholder="Enter GL name"
                          />
                        ) : (
                          m.glAccountName
                            ? m.glAccountName
                            : <span className="text-muted-foreground italic text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.debitCredit === 'debit' ? 'default' : 'secondary'}>
                          {m.debitCredit === 'debit' ? 'Dr' : 'Cr'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{m.sapAcctCode && m.sapAcctCode !== m.glAccountCode ? m.sapAcctCode : ''}</span>
                        {m.sapValidatedAt && <CheckCircle className="h-3 w-3 text-green-500 inline ml-1" />}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openSapSearch(m)} title="Search SAP CoA">
                            <Search className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
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
                  <div className="text-sm">{catBadge(editRow.category)}</div>
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
              <div>
                <Button variant="outline" size="sm" type="button" onClick={loadSapAccounts} disabled={sapLoading}>
                  {sapLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                  {sapAccounts.length > 0 ? 'SAP GL Accounts Loaded' : 'Load SAP GL Accounts'}
                </Button>
                {sapAccounts.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={sapSearch}
                      onChange={e => setSapSearch(e.target.value)}
                      placeholder="Search SAP accounts..."
                      className="h-8 text-sm"
                    />
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {sapAccounts
                        .filter(a => !sapSearch || a.name?.toLowerCase().includes(sapSearch.toLowerCase()) || a.code?.toLowerCase().includes(sapSearch.toLowerCase()))
                        .slice(0, 20)
                        .map((a: any) => (
                          <div
                            key={a.code}
                            className="px-3 py-1.5 hover:bg-muted cursor-pointer text-sm flex justify-between items-center border-b last:border-b-0"
                            onClick={() => setForm(f => ({ ...f, glAccountCode: a.code, glAccountName: a.name }))}
                          >
                            <span className="font-mono text-xs">{a.code}</span>
                            <span className="text-xs text-muted-foreground truncate ml-2">{a.name}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
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

      <Dialog open={showSapSearch} onOpenChange={setShowSapSearch}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Search SAP Chart of Accounts</DialogTitle>
            <DialogDescription>
              Search by account name, code, or format code. {sapSearchTarget ? `Linking to: ${sapSearchTarget.componentName}` : 'Browse mode — click to link to a GL mapping.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={sapSearchQuery}
              onChange={e => setSapSearchQuery(e.target.value)}
              placeholder="e.g. salary, basic, PF, professional tax..."
              onKeyDown={e => { if (e.key === 'Enter') searchSapCoA(sapSearchQuery); }}
            />
            <Button onClick={() => searchSapCoA(sapSearchQuery)} disabled={sapSearchLoading || sapSearchQuery.length < 2}>
              {sapSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {sapSearchResults.length > 0 && (
            <div className="overflow-auto max-h-[50vh] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AcctCode (Internal)</TableHead>
                    <TableHead>FormatCode (Display)</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Type</TableHead>
                    {sapSearchTarget && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sapSearchResults.map((acct: any) => (
                    <TableRow key={acct.acctCode} className={sapSearchTarget ? 'cursor-pointer hover:bg-muted/70' : ''}>
                      <TableCell className="font-mono text-xs font-bold">{acct.acctCode}</TableCell>
                      <TableCell className="font-mono text-xs">{acct.formatCode}</TableCell>
                      <TableCell className="text-sm">{acct.acctName}</TableCell>
                      <TableCell>
                        {acct.active === 'tYES' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-red-500" />}
                      </TableCell>
                      <TableCell className="text-xs">{acct.accountType}</TableCell>
                      {sapSearchTarget && (
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => selectSapAccount(acct)}>
                            <Link2 className="h-3 w-3 mr-1" /> Link
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {sapSearchResults.length === 0 && sapSearchQuery.length >= 2 && !sapSearchLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">No results found. Try a different search term.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>GL Mapping Validation Results</DialogTitle>
            <DialogDescription>
              Company DB: {validationResults?.companyDb} | {validationResults?.summary?.valid} valid, {validationResults?.summary?.invalid} invalid, {validationResults?.summary?.empty} empty
            </DialogDescription>
          </DialogHeader>
          {validationResults && (
            <div className="overflow-auto max-h-[60vh] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Configured GL</TableHead>
                    <TableHead>SAP AcctCode</TableHead>
                    <TableHead>SAP Account Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(validationResults.results || []).map((r: any) => (
                    <TableRow key={r.id} className={r.status === 'valid' ? '' : r.status === 'empty' ? 'bg-yellow-50' : 'bg-red-50'}>
                      <TableCell className="font-mono text-xs">{r.componentCode}</TableCell>
                      <TableCell className="text-xs">{r.category}</TableCell>
                      <TableCell className="font-mono text-xs">{r.configuredGL || '—'}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{r.sapAcctCode || '—'}</TableCell>
                      <TableCell className="text-xs">{r.sapAcctName || '—'}</TableCell>
                      <TableCell>
                        {r.status === 'valid' && <Badge className="bg-green-600">Valid</Badge>}
                        {r.status === 'not_found' && <Badge variant="destructive">Not Found</Badge>}
                        {r.status === 'ambiguous' && <Badge className="bg-amber-600">Ambiguous</Badge>}
                        {r.status === 'empty' && <Badge variant="outline">Empty</Badge>}
                      </TableCell>
                      <TableCell>
                        {(r.status === 'not_found' || r.status === 'empty' || r.status === 'ambiguous') && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setShowValidation(false);
                            openSapSearch({ id: r.id, componentName: r.componentName || r.componentCode, debitCredit: 'credit' });
                          }}>
                            <Search className="h-3 w-3 mr-1" /> Fix
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
