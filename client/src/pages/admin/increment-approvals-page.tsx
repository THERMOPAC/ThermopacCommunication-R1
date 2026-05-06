import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, XCircle, TrendingUp, Clock, History, AlertTriangle, Loader2, User, Plus, FileText, Printer, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';
import { fmtDate, april1Display, april1Iso } from '@/lib/date-utils';

type Proposal = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeSalaryId: number;
  incrementPercentage: string;
  oldBasicSalary: string;
  proposedBasicSalary: string;
  oldCtc: string;
  proposedCtc: string;
  effectiveDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  remarks: string;
  rejectionReason?: string;
  proposedByName: string;
  proposedAt: string;
  appliedAt?: string;
  appraisalId?: number;
  appraisalFinalScore?: string;
  appraisalRating?: string;
  systemSuggestedIncrementPct?: string;
  minIncrementPct?: string;
  maxIncrementPct?: string;
  finalProposedIncrementPct?: string;
  editedByName?: string;
  editedAt?: string;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pending',  className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  applied:  { label: 'Applied',  className: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
};

const fmt = (v: string | number) =>
  `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDecimal = (v: string | number) =>
  `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type SalarySetupEntry = {
  id: number;
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  basicSalary: string;
  ctcMonthly: string;
  salaryType: string | null;
};

const BLANK_CREATE = { salaryId: '', pct: '10', effectiveDateDisplay: april1Display(), effectiveDateIso: april1Iso(), remarks: 'Yearly Increment' };

export default function IncrementApprovalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('applied');
  const [approveTarget, setApproveTarget] = useState<Proposal | null>(null);
  const [approveDate, setApproveDate] = useState<string>(april1Display());
  const [approveDateIso, setApproveDateIso] = useState<string>(april1Iso());
  const [rejectTarget, setRejectTarget]   = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...BLANK_CREATE });

  const parseDDMMYYYY = (val: string): string => {
    const p = val.split('/');
    if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    return approveDateIso;
  };

  const { data: eligibleData } = useQuery<{ cycle: { id: number; financialYear: string } | null; employees: SalarySetupEntry[] }>({
    queryKey: ['/api/admin/payroll/manual-increment-eligible'],
    enabled: showCreate,
    staleTime: 0,
    gcTime: 0,
  });
  const salarySetup = eligibleData?.employees ?? [];
  const activeCycleLabel = eligibleData?.cycle ? `FY ${eligibleData.cycle.financialYear}` : null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const pct = parseFloat(createForm.pct);
      if (isNaN(pct) || pct < -10 || pct > 40) throw new Error('Increment % must be between -10 and 40');
      if (!createForm.salaryId) throw new Error('Please select an employee');
      return await apiRequest('POST', `/api/admin/payroll/salary-setup/${createForm.salaryId}/increment`, {
        incrementPercentage: pct,
        effectiveDate: createForm.effectiveDateIso,
        remarks: createForm.remarks || 'Yearly Increment',
      });
    },
    onSuccess: () => {
      toast({ title: 'Created', description: 'Manual increment proposal created successfully.' });
      setShowCreate(false);
      setCreateForm({ ...BLANK_CREATE });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/pending-count'] });
      queryClient.removeQueries({ queryKey: ['/api/admin/payroll/manual-increment-eligible'] });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (!user || user.role !== 'Superuser') {
    return <Redirect to="/admin/payroll" />;
  }

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ['/api/admin/payroll/increment-proposals/all'],
  });

  const pendingCount = proposals.filter(p => p.status === 'pending').length;

  const filtered = statusFilter === 'all'
    ? proposals
    : proposals.filter(p => p.status === statusFilter);

  const reportRows = reportStatusFilter === 'all'
    ? proposals
    : proposals.filter(p => p.status === reportStatusFilter);

  const approveMutation = useMutation({
    mutationFn: async ({ proposalId, effectiveDate }: { proposalId: number; effectiveDate: string }) => {
      return await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/approve`, { effectiveDate });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Approved', description: data.message || 'Increment proposal approved.' });
      setApproveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/salary-setup'] });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: number; reason: string }) => {
      return await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/reject`, { rejectionReason: reason });
    },
    onSuccess: () => {
      toast({ title: 'Rejected', description: 'Increment proposal rejected.' });
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/increment-proposals/pending-count'] });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head>
        <title>Old Basic vs New Basic — THERMOPAC</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
          h1 { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
          .subtitle { font-size: 10px; color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #1e40af; color: white; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) td { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .positive { color: #166534; font-weight: 600; }
          .negative { color: #991b1b; font-weight: 600; }
          .mono { font-family: monospace; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 9px; font-size: 9px; font-weight: 600; }
          .badge-applied { background: #dcfce7; color: #166534; }
          .badge-approved { background: #dbeafe; color: #1e40af; }
          .badge-pending { background: #fef3c7; color: #92400e; }
          .badge-rejected { background: #fee2e2; color: #991b1b; }
          .footer { margin-top: 20px; font-size: 9px; color: #888; text-align: right; }
          .summary { display: flex; gap: 24px; margin-bottom: 14px; padding: 10px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; }
          .summary-item { }
          .summary-item .label { font-size: 9px; color: #555; text-transform: uppercase; }
          .summary-item .value { font-size: 13px; font-weight: bold; color: #0369a1; }
        </style>
      </head><body>
        ${el.innerHTML}
        <div class="footer">Generated on ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })} · THERMOPAC ERP</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const totalOldBasic = reportRows.reduce((s, p) => s + parseFloat(p.oldBasicSalary || '0'), 0);
  const totalNewBasic = reportRows.reduce((s, p) => s + parseFloat(p.proposedBasicSalary || '0'), 0);
  const totalOldCtc   = reportRows.reduce((s, p) => s + parseFloat(p.oldCtc || '0'), 0);
  const totalNewCtc   = reportRows.reduce((s, p) => s + parseFloat(p.proposedCtc || '0'), 0);

  return (
    <>
      <Helmet><title>Increment Approvals — THERMOPAC ERP</title></Helmet>

      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Increment Management</h1>
              <p className="text-sm text-muted-foreground">Approve proposals and view salary revision reports</p>
            </div>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            onClick={() => { setCreateForm({ ...BLANK_CREATE }); setShowCreate(true); }}
          >
            <Plus className="h-4 w-4" /> New Manual Increment
          </Button>
        </div>

        <Tabs defaultValue="approvals">
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            <TabsTrigger
              value="approvals"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent px-4 pb-2 text-sm font-medium"
            >
              Approvals
            </TabsTrigger>
            <TabsTrigger
              value="report"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 data-[state=active]:bg-transparent px-4 pb-2 text-sm font-medium gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" /> Old Basic vs New Basic Report
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Approvals ────────────────────────────────────────────── */}
          <TabsContent value="approvals" className="mt-4 space-y-4">

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['pending','approved','applied','rejected'] as const).map(s => {
                const cfg = STATUS_CONFIG[s];
                const n = proposals.filter(p => p.status === s).length;
                return (
                  <Card key={s} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setStatusFilter(s)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground capitalize">{s}</span>
                      <Badge className={`${cfg.className} text-sm font-semibold`}>{n}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Filter + table */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {statusFilter === 'all' ? 'All Proposals' : `${STATUS_CONFIG[statusFilter]?.label} Proposals`}
                  <span className="ml-auto text-xs font-normal">({filtered.length} records)</span>
                </CardTitle>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <Clock className="h-8 w-8" />
                    <p className="text-sm">No proposals found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left p-3 pl-4">Employee</th>
                          <th className="text-center p-3">Appraisal</th>
                          <th className="text-right p-3">Current Basic</th>
                          <th className="text-right p-3">Proposed Basic</th>
                          <th className="text-center p-3">Increment</th>
                          <th className="text-left p-3">Effective Date</th>
                          <th className="text-left p-3">Proposed By</th>
                          <th className="text-left p-3">Status</th>
                          <th className="text-left p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p, i) => (
                          <tr key={p.id} className={`border-b hover:bg-gray-50/60 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                            <td className="p-3 pl-4 font-medium">
                              <div className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                {p.employeeName}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {fmtDate(p.proposedAt)}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {p.appraisalId ? (
                                <div className="space-y-0.5">
                                  {p.appraisalFinalScore && (
                                    <div className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                                      {Number(p.appraisalFinalScore).toFixed(2)}
                                    </div>
                                  )}
                                  {p.appraisalRating && (
                                    <div className="text-xs text-gray-500">{p.appraisalRating}</div>
                                  )}
                                  {p.systemSuggestedIncrementPct && (
                                    <div className="text-xs text-indigo-600 font-medium">
                                      Sys: {Number(p.systemSuggestedIncrementPct).toFixed(1)}%
                                      {p.minIncrementPct && <span className="text-gray-400 ml-0.5">({Number(p.minIncrementPct).toFixed(0)}–{Number(p.maxIncrementPct).toFixed(0)}%)</span>}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-xs text-gray-400">Manual</span>}
                            </td>
                            <td className="p-3 text-right font-mono">{fmt(p.oldBasicSalary)}</td>
                            <td className="p-3 text-right font-mono text-green-700 font-semibold">{fmt(p.proposedBasicSalary)}</td>
                            <td className="p-3 text-center">
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
                                  +{parseFloat(p.incrementPercentage).toFixed(1)}%
                                </span>
                                {p.finalProposedIncrementPct && parseFloat(p.finalProposedIncrementPct) !== parseFloat(p.incrementPercentage) && (
                                  <div className="text-[10px] text-amber-600">Final: {Number(p.finalProposedIncrementPct).toFixed(1)}%</div>
                                )}
                                {p.rejectionReason && (
                                  <div className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={p.rejectionReason}>
                                    Reason: {p.rejectionReason}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-gray-700">{fmtDate(p.effectiveDate)}</td>
                            <td className="p-3 text-gray-600">{p.proposedByName}</td>
                            <td className="p-3">
                              <Badge className={`${STATUS_CONFIG[p.status]?.className} text-xs border`}>
                                {STATUS_CONFIG[p.status]?.label}
                              </Badge>
                              {p.appliedAt && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  Applied {fmtDate(p.appliedAt)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              {p.status === 'pending' && (
                                <div className="flex gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                                    onClick={() => { setApproveTarget(p); setApproveDate(april1Display()); setApproveDateIso(april1Iso()); }}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                                    onClick={() => { setRejectTarget(p); setRejectReason(''); }}
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Reject
                                  </Button>
                                </div>
                              )}
                              {p.status === 'approved' && (
                                <span className="text-xs text-blue-600 flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Awaiting {fmtDate(p.effectiveDate)}
                                </span>
                              )}
                              {p.status === 'applied' && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> Applied
                                </span>
                              )}
                              {p.status === 'rejected' && (
                                <span className="text-xs text-red-500 flex items-center gap-1">
                                  <XCircle className="h-3 w-3" /> Rejected
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 2: Old Basic vs New Basic Report ────────────────────────── */}
          <TabsContent value="report" className="mt-4 space-y-4">

            {/* Controls */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filter:</span>
                <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="applied">Applied Only</SelectItem>
                    <SelectItem value="approved">Approved Only</SelectItem>
                    <SelectItem value="pending">Pending Only</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">({reportRows.length} employees)</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={handlePrint}
              >
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Button>
            </div>

            {/* Summary strip */}
            {reportRows.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-gray-50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Old Basic</p>
                    <p className="text-base font-bold font-mono mt-0.5">{fmt(totalOldBasic)}</p>
                    <p className="text-[10px] text-muted-foreground">/month</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-3">
                    <p className="text-xs text-green-700">Total New Basic</p>
                    <p className="text-base font-bold font-mono text-green-800 mt-0.5">{fmt(totalNewBasic)}</p>
                    <p className="text-[10px] text-green-600">+{fmt(totalNewBasic - totalOldBasic)}/month increase</p>
                  </CardContent>
                </Card>
                <Card className="bg-gray-50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Total Old CTC</p>
                    <p className="text-base font-bold font-mono mt-0.5">{fmt(totalOldCtc)}</p>
                    <p className="text-[10px] text-muted-foreground">/month</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-3">
                    <p className="text-xs text-green-700">Total New CTC</p>
                    <p className="text-base font-bold font-mono text-green-800 mt-0.5">{fmt(totalNewCtc)}</p>
                    <p className="text-[10px] text-green-600">+{fmt(totalNewCtc - totalOldCtc)}/month increase</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Printable report table */}
            <div ref={printRef}>
              {/* Print header — visible only in print */}
              <div className="hidden print:block mb-4">
                <h1 style={{ fontSize: '15px', fontWeight: 'bold' }}>Salary Revision Report — Old Basic vs New Basic</h1>
                <div style={{ fontSize: '10px', color: '#555' }}>
                  THERMOPAC · Status: {reportStatusFilter === 'all' ? 'All' : reportStatusFilter.charAt(0).toUpperCase() + reportStatusFilter.slice(1)} · {reportRows.length} employees
                </div>
              </div>

              {/* Summary for print */}
              {reportRows.length > 0 && (
                <div className="hidden" id="print-summary"
                  style={{ display: 'flex', gap: '24px', marginBottom: '14px', padding: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                  <div><div className="label">Employees</div><div className="value">{reportRows.length}</div></div>
                  <div><div className="label">Old Basic Total</div><div className="value">{fmt(totalOldBasic)}/mo</div></div>
                  <div><div className="label">New Basic Total</div><div className="value">{fmt(totalNewBasic)}/mo</div></div>
                  <div><div className="label">Old CTC Total</div><div className="value">{fmt(totalOldCtc)}/mo</div></div>
                  <div><div className="label">New CTC Total</div><div className="value">{fmt(totalNewCtc)}/mo</div></div>
                </div>
              )}

              <Card>
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : reportRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">No records found for the selected filter</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-blue-800 text-white text-xs uppercase tracking-wide">
                            <th className="text-left p-3 pl-4">#</th>
                            <th className="text-left p-3">Employee</th>
                            <th className="text-right p-3">Old Basic</th>
                            <th className="text-right p-3">New Basic</th>
                            <th className="text-right p-3">Difference</th>
                            <th className="text-center p-3">Increment %</th>
                            <th className="text-right p-3">Old CTC/mo</th>
                            <th className="text-right p-3">New CTC/mo</th>
                            <th className="text-center p-3">Effective Date</th>
                            <th className="text-center p-3">Status</th>
                            <th className="text-left p-3">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportRows.map((p, i) => {
                            const oldB = parseFloat(p.oldBasicSalary || '0');
                            const newB = parseFloat(p.proposedBasicSalary || '0');
                            const diff = newB - oldB;
                            const pct  = parseFloat(p.incrementPercentage || '0');
                            const oldC = parseFloat(p.oldCtc || '0');
                            const newC = parseFloat(p.proposedCtc || '0');
                            const isNeg = diff < 0;
                            return (
                              <tr key={p.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/30 transition-colors`}>
                                <td className="p-3 pl-4 text-xs text-gray-400">{i + 1}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5 font-medium text-gray-900">
                                    <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    {p.employeeName}
                                  </div>
                                  {p.appliedAt && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">Applied {fmtDate(p.appliedAt)}</div>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono text-gray-700">
                                  {fmtDecimal(oldB)}
                                </td>
                                <td className="p-3 text-right font-mono font-semibold text-green-700">
                                  {fmtDecimal(newB)}
                                </td>
                                <td className="p-3 text-right font-mono">
                                  <span className={`flex items-center justify-end gap-0.5 font-semibold text-xs ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                                    {isNeg
                                      ? <ArrowDownRight className="h-3 w-3" />
                                      : <ArrowUpRight className="h-3 w-3" />
                                    }
                                    {isNeg ? '-' : '+'}{fmtDecimal(Math.abs(diff))}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${isNeg ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-green-50 text-green-700 ring-green-600/20'}`}>
                                    {isNeg ? '' : '+'}{pct.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono text-xs text-gray-600">{fmt(oldC)}</td>
                                <td className="p-3 text-right font-mono text-xs font-semibold text-green-700">{fmt(newC)}</td>
                                <td className="p-3 text-center text-xs text-gray-700 whitespace-nowrap">
                                  {fmtDate(p.effectiveDate)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${STATUS_CONFIG[p.status]?.className}`}>
                                    {STATUS_CONFIG[p.status]?.label}
                                  </span>
                                </td>
                                <td className="p-3 text-xs text-gray-500 max-w-[140px] truncate" title={p.remarks}>
                                  {p.remarks || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Totals row */}
                        <tfoot>
                          <tr className="bg-blue-50 border-t-2 border-blue-200 font-semibold text-sm">
                            <td className="p-3 pl-4 text-xs text-gray-500" colSpan={2}>
                              Total ({reportRows.length} employees)
                            </td>
                            <td className="p-3 text-right font-mono text-gray-800">{fmtDecimal(totalOldBasic)}</td>
                            <td className="p-3 text-right font-mono text-green-700">{fmtDecimal(totalNewBasic)}</td>
                            <td className="p-3 text-right font-mono text-green-600 text-xs">
                              +{fmtDecimal(totalNewBasic - totalOldBasic)}
                            </td>
                            <td className="p-3 text-center text-xs text-green-700">
                              {totalOldBasic > 0 ? `+${(((totalNewBasic - totalOldBasic) / totalOldBasic) * 100).toFixed(1)}%` : '—'}
                            </td>
                            <td className="p-3 text-right font-mono text-xs text-gray-700">{fmt(totalOldCtc)}</td>
                            <td className="p-3 text-right font-mono text-xs text-green-700">{fmt(totalNewCtc)}</td>
                            <td colSpan={3}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Approve confirmation dialog ─────────────────────────────────────── */}
      <Dialog open={!!approveTarget} onOpenChange={open => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" /> Approve Increment
            </DialogTitle>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5">
                <p><span className="font-medium">Employee:</span> {approveTarget.employeeName}</p>
                <p><span className="font-medium">Increment:</span> +{parseFloat(approveTarget.incrementPercentage).toFixed(1)}%</p>
                <p><span className="font-medium">New Basic:</span> {fmt(approveTarget.proposedBasicSalary)}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Effective Date</label>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={approveDate}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setApproveDate(raw);
                    const iso = parseDDMMYYYY(raw);
                    if (iso) setApproveDateIso(iso);
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Salary will update automatically on or after the effective date. No immediate change to payroll.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white gap-1"
              disabled={approveMutation.isPending}
              onClick={() => approveTarget && approveMutation.mutate({ proposalId: approveTarget.id, effectiveDate: approveDateIso })}
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Confirm Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Manual Increment dialog ─────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) setShowCreate(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" /> New Manual Increment
            </DialogTitle>
            {activeCycleLabel && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing active employees with <strong>no completed appraisal</strong> in {activeCycleLabel}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Employee <span className="text-red-500">*</span></Label>
              {salarySetup.length === 0 && eligibleData ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  All employees with salary records already have an appraisal in {activeCycleLabel ?? 'the current cycle'}.
                </div>
              ) : (
              <Select
                value={createForm.salaryId}
                onValueChange={v => setCreateForm(f => ({ ...f, salaryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {salarySetup.map(s => {
                    const displayName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username;
                    const isDaily = s.salaryType === 'daily';
                    const rateLabel = isDaily ? 'Daily' : 'Basic';
                    return (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {displayName} [{isDaily ? 'Daily' : 'Monthly'}] — {rateLabel} ₹{parseFloat(s.basicSalary).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Increment % <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min="-10"
                max="40"
                step="0.5"
                value={createForm.pct}
                onChange={e => setCreateForm(f => ({ ...f, pct: e.target.value }))}
                placeholder="e.g. 10"
              />
              <p className="text-xs text-muted-foreground">Allowed range: −10% to 40%</p>
            </div>

            {createForm.salaryId && (() => {
              const sel = salarySetup.find(s => String(s.id) === createForm.salaryId);
              if (!sel) return null;
              const isDaily = sel.salaryType === 'daily';
              const pct = parseFloat(createForm.pct) || 0;
              const oldB = parseFloat(sel.basicSalary);
              const newB = parseFloat((oldB * (1 + pct / 100)).toFixed(2));
              const unit = isDaily ? '/day' : '/mo';
              const rateLabel = isDaily ? 'Daily Rate' : 'Monthly Basic';
              return (
                <div className="rounded-lg border bg-blue-50 border-blue-200 px-3 py-2.5 text-xs space-y-1">
                  {isDaily && (
                    <div className="flex items-center gap-1 text-amber-700 font-medium mb-1">
                      <span>⚡</span> Daily salary employee — rate shown per day
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Current {rateLabel}:</span>
                    <span className="font-mono font-medium">₹{oldB.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Proposed {rateLabel}:</span>
                    <span className="font-mono font-semibold text-green-700">₹{newB.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Difference:</span>
                    <span className="font-mono text-blue-700">+₹{(newB - oldB).toLocaleString('en-IN', { maximumFractionDigits: 2 })}{unit}</span>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Effective Date <span className="text-red-500">*</span></Label>
              <Input
                type="text"
                placeholder="DD/MM/YYYY"
                value={createForm.effectiveDateDisplay}
                onChange={e => {
                  const raw = e.target.value;
                  const p = raw.split('/');
                  const iso = (p.length === 3 && p[2].length === 4)
                    ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`
                    : createForm.effectiveDateIso;
                  setCreateForm(f => ({ ...f, effectiveDateDisplay: raw, effectiveDateIso: iso }));
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Remarks</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Performance-based increment, Ad-hoc revision…"
                value={createForm.remarks}
                onChange={e => setCreateForm(f => ({ ...f, remarks: e.target.value }))}
              />
            </div>

            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              This creates a proposal that still requires Superuser approval before taking effect. No appraisal cycle needed.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
              disabled={createMutation.isPending || !createForm.salaryId}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" /> Reject Increment Proposal
            </DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-gray-50 p-3 space-y-1.5">
                <p><span className="font-medium">Employee:</span> {rejectTarget.employeeName}</p>
                <p><span className="font-medium">Increment:</span> +{parseFloat(rejectTarget.incrementPercentage).toFixed(1)}% · Effective {fmtDate(rejectTarget.effectiveDate)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Rejection Reason <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Enter reason for rejection…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectTarget && rejectMutation.mutate({ proposalId: rejectTarget.id, reason: rejectReason })}
              className="gap-1"
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
