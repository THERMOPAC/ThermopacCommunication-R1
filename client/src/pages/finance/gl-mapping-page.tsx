import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, AlertTriangle, CheckCircle, Pencil, Trash2, Landmark } from "lucide-react";
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
];

const CONTEXTS = [
  { value: 'payroll_liability', label: 'Payroll Liability' },
  { value: 'statutory_payment', label: 'Statutory Payment' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'expense', label: 'Expense' },
];

const CATEGORIES = [
  { value: 'earning', label: 'Earnings', color: 'bg-green-100 text-green-800' },
  { value: 'deduction', label: 'Deductions', color: 'bg-red-100 text-red-800' },
  { value: 'statutory', label: 'Statutory', color: 'bg-blue-100 text-blue-800' },
  { value: 'employer_contribution', label: 'Employer Contributions', color: 'bg-purple-100 text-purple-800' },
];

export default function GlMappingPage() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterContext, setFilterContext] = useState<string>('all');
  const [form, setForm] = useState({
    componentCode: '', componentName: '', category: '', postingContext: '',
    glAccountCode: '', glAccountName: '', debitCredit: 'debit',
  });

  const { data: mappings = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/statutory/gl-mappings'] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/statutory/gl-mappings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] }); setShowDialog(false); toast({ title: 'GL Mapping created' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/statutory/gl-mappings/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] }); setShowDialog(false); toast({ title: 'GL Mapping updated' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/statutory/gl-mappings/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/statutory/gl-mappings'] }); toast({ title: 'GL Mapping deleted' }); },
  });

  function openCreate() {
    setEditId(null);
    setForm({ componentCode: '', componentName: '', category: '', postingContext: '', glAccountCode: '', glAccountName: '', debitCredit: 'debit' });
    setShowDialog(true);
  }

  function openEdit(m: any) {
    setEditId(m.id);
    setForm({
      componentCode: m.componentCode, componentName: m.componentName, category: m.category,
      postingContext: m.postingContext, glAccountCode: m.glAccountCode, glAccountName: m.glAccountName || '', debitCredit: m.debitCredit,
    });
    setShowDialog(true);
  }

  function handleSave() {
    if (editId) {
      updateMutation.mutate({ id: editId, glAccountCode: form.glAccountCode, glAccountName: form.glAccountName, debitCredit: form.debitCredit, isActive: true });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleComponentSelect(code: string) {
    const comp = COMPONENTS.find(c => c.code === code);
    if (comp) setForm(f => ({ ...f, componentCode: code, componentName: comp.name, category: comp.category }));
  }

  const filtered = mappings.filter((m: any) => {
    if (filterCategory !== 'all' && m.category !== filterCategory) return false;
    if (filterContext !== 'all' && m.postingContext !== filterContext) return false;
    return true;
  });

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: filtered.filter((m: any) => m.category === cat.value),
  })).filter(g => g.items.length > 0);

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
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add Mapping</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{mappings.length}</div>
            <div className="text-sm text-muted-foreground">Total Mappings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{mappings.filter((m: any) => m.isActive).length}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{new Set(mappings.map((m: any) => m.componentCode)).size}</div>
            <div className="text-sm text-muted-foreground">Components Mapped</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{COMPONENTS.length - new Set(mappings.map((m: any) => m.componentCode)).size}</div>
            <div className="text-sm text-muted-foreground">Unmapped Components</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterContext} onValueChange={setFilterContext}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by Context" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            {CONTEXTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-10">Loading...</div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-orange-500 mb-4" />
            <h3 className="text-lg font-semibold">No GL Mappings Found</h3>
            <p className="text-muted-foreground mt-2">Add GL account mappings to enable SAP posting for payroll and statutory modules.</p>
          </CardContent>
        </Card>
      ) : (
        grouped.map(group => (
          <Card key={group.value}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Badge className={group.color}>{group.label}</Badge>
                <span className="text-sm text-muted-foreground">({group.items.length} mappings)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component Code</TableHead>
                    <TableHead>Component Name</TableHead>
                    <TableHead>Posting Context</TableHead>
                    <TableHead>GL Account Code</TableHead>
                    <TableHead>GL Account Name</TableHead>
                    <TableHead>Dr/Cr</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-sm">{m.componentCode}</TableCell>
                      <TableCell>{m.componentName}</TableCell>
                      <TableCell><Badge variant="outline">{contextLabel(m.postingContext)}</Badge></TableCell>
                      <TableCell className="font-mono">{m.glAccountCode}</TableCell>
                      <TableCell>{m.glAccountName || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={m.debitCredit === 'debit' ? 'default' : 'secondary'}>
                          {m.debitCredit === 'debit' ? 'Dr' : 'Cr'}
                        </Badge>
                      </TableCell>
                      <TableCell>{m.isActive ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-orange-500" />}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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
            <DialogTitle>{editId ? 'Edit GL Mapping' : 'Add GL Mapping'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editId && (
              <>
                <div>
                  <label className="text-sm font-medium">Component</label>
                  <Select value={form.componentCode} onValueChange={handleComponentSelect}>
                    <SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger>
                    <SelectContent>
                      {COMPONENTS.map(c => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Posting Context</label>
                  <Select value={form.postingContext} onValueChange={v => setForm(f => ({ ...f, postingContext: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select context" /></SelectTrigger>
                    <SelectContent>
                      {CONTEXTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">GL Account Code</label>
              <Input value={form.glAccountCode} onChange={e => setForm(f => ({ ...f, glAccountCode: e.target.value }))} placeholder="e.g., 211001" />
            </div>
            <div>
              <label className="text-sm font-medium">GL Account Name</label>
              <Input value={form.glAccountName} onChange={e => setForm(f => ({ ...f, glAccountName: e.target.value }))} placeholder="e.g., PF Payable" />
            </div>
            <div>
              <label className="text-sm font-medium">Debit / Credit</label>
              <Select value={form.debitCredit} onValueChange={v => setForm(f => ({ ...f, debitCredit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
