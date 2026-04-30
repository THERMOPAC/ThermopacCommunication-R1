import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, XCircle, TrendingUp, Clock, History, AlertTriangle, Loader2, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';

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
  createdAt: string;
  appliedAt?: string;
  // Appraisal-driven fields
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

export default function IncrementApprovalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [approveTarget, setApproveTarget] = useState<Proposal | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<Proposal | null>(null);
  const [rejectReason, setRejectReason]   = useState('');

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

  const approveMutation = useMutation({
    mutationFn: async (proposalId: number) => {
      const res = await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/approve`, {});
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Approval failed'); }
      return res.json();
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
      const res = await apiRequest('POST', `/api/admin/payroll/increment-proposals/${proposalId}/reject`, { rejectionReason: reason });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Rejection failed'); }
      return res.json();
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

  return (
    <>
      <Helmet><title>Increment Approvals — THERMOPAC ERP</title></Helmet>

      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Increment Approvals</h1>
              <p className="text-sm text-muted-foreground">Review and act on salary increment proposals</p>
            </div>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs px-2 py-0.5">
                {pendingCount} pending
              </Badge>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
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
        </div>

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

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <History className="h-4 w-4" />
              {statusFilter === 'all' ? 'All Proposals' : `${STATUS_CONFIG[statusFilter]?.label} Proposals`}
              <span className="ml-auto text-xs font-normal">({filtered.length} records)</span>
            </CardTitle>
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
                            {new Date(p.createdAt).toLocaleDateString('en-IN')}
                          </div>
                        </td>
                        {/* Appraisal column */}
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
                        <td className="p-3 text-gray-700">{p.effectiveDate}</td>
                        <td className="p-3 text-gray-600">{p.proposedByName}</td>
                        <td className="p-3">
                          <Badge className={`${STATUS_CONFIG[p.status]?.className} text-xs border`}>
                            {STATUS_CONFIG[p.status]?.label}
                          </Badge>
                          {p.appliedAt && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Applied {new Date(p.appliedAt).toLocaleDateString('en-IN')}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          {p.status === 'pending' && (
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 px-2 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                                onClick={() => setApproveTarget(p)}
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
                              <Clock className="h-3 w-3" /> Awaiting {p.effectiveDate}
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
                <p><span className="font-medium">Effective Date:</span> {approveTarget.effectiveDate}</p>
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
              onClick={() => approveTarget && approveMutation.mutate(approveTarget.id)}
            >
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Confirm Approve
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
                <p><span className="font-medium">Increment:</span> +{parseFloat(rejectTarget.incrementPercentage).toFixed(1)}% · Effective {rejectTarget.effectiveDate}</p>
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
