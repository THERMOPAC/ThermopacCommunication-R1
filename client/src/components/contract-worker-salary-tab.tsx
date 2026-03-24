import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Trash2, ShieldCheck, Pause, XCircle, Undo2, Send, Loader2,
  CheckCircle, AlertCircle, Clock, Calculator, HardHat, Users, Pencil, RotateCcw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const fmt = (v: number | string | null | undefined) => {
  const n = parseFloat(String(v || '0'));
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'generated':
      return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50"><Clock className="h-3 w-3 mr-1" /> Generated</Badge>;
    case 'verified':
      return <Badge className="bg-emerald-600 text-white"><ShieldCheck className="h-3 w-3 mr-1" /> Verified</Badge>;
    case 'held':
      return <Badge className="bg-amber-600 text-white"><Pause className="h-3 w-3 mr-1" /> Held</Badge>;
    case 'rejected':
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
    case 'transferred':
      return <Badge className="bg-purple-600 text-white"><Send className="h-3 w-3 mr-1" /> Transferred</Badge>;
    case 'reversed':
      return <Badge className="bg-gray-600 text-white"><RotateCcw className="h-3 w-3 mr-1" /> Reversed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function SapBadge({ sapPostingStatus, sapJeNumber }: { sapPostingStatus: string | null; sapJeNumber: string | null }) {
  if (sapPostingStatus === 'posted') {
    return <Badge className="bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" /> JE #{sapJeNumber}</Badge>;
  }
  if (sapPostingStatus === 'failed') {
    return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
  }
  if (sapPostingStatus === 'pending') {
    return <Badge variant="outline" className="text-amber-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Posting...</Badge>;
  }
  return <Badge variant="outline" className="text-gray-400">Not Posted</Badge>;
}

export function ManualSalaryTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [reasonDialog, setReasonDialog] = useState<{ open: boolean; entryId: number; action: string }>({ open: false, entryId: 0, action: '' });
  const [reasonText, setReasonText] = useState('');

  const [formData, setFormData] = useState({
    periodId: '',
    userId: '',
    entryType: 'daily',
    daysWorked: '0',
    hoursWorked: '0',
    quantity: '0',
    baseRate: '',
    overtimeHours: '0',
    overtimeRateMultiplier: '1.5',
    entryPurpose: 'ot_only',
    remarks: '',
  });

  const { data: periods = [] } = useQuery<any[]>({ queryKey: ['/api/payroll/payroll-periods'] });
  const { data: allUsers = [] } = useQuery<any[]>({ queryKey: ['/api/users'] });
  const { data: salaryConfigs = [] } = useQuery<any[]>({ queryKey: ['/api/admin/payroll/salary-setup'] });
  const { data: glMappings = [] } = useQuery<any[]>({ queryKey: ['/api/statutory/gl-mappings'] });

  useEffect(() => {
    if (!formData.userId || editingEntry) return;
    const config = salaryConfigs.find((c: any) => c.userId === parseInt(formData.userId) && c.isActive);
    if (config) {
      const basic = parseFloat(config.basicSalary || '0');
      const user = allUsers.find((u: any) => u.id === parseInt(formData.userId));
      let dutyHours = parseFloat(config.workingHoursPerDay || '8') || 8;
      if (user?.dutyTimeIn && user?.dutyTimeOut) {
        const [inH, inM] = user.dutyTimeIn.split(':').map(Number);
        const [outH, outM] = user.dutyTimeOut.split(':').map(Number);
        const rawHours = (outH * 60 + outM - inH * 60 - inM) / 60;
        if (rawHours > 0) dutyHours = rawHours;
      }
      let rate: number;
      if (config.salaryType === 'daily') {
        rate = basic / dutyHours;
      } else {
        rate = (basic * 2.5) / 30 / dutyHours;
      }
      setFormData(d => ({ ...d, baseRate: rate.toFixed(2) }));
    }
  }, [formData.userId, salaryConfigs, allUsers, editingEntry]);


  const effectivePeriodId = selectedPeriodId && selectedPeriodId !== 'all' ? selectedPeriodId : '';

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/manual-salary/list', effectivePeriodId],
    queryFn: async () => {
      const url = effectivePeriodId ? `/api/manual-salary/list?periodId=${effectivePeriodId}` : '/api/manual-salary/list';
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const [preview, setPreview] = useState<any>(null);

  const previewMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/manual-salary/preview', data),
    onSuccess: (data: any) => setPreview(data),
  });

  useEffect(() => {
    const baseRate = parseFloat(formData.baseRate || '0');
    if (baseRate <= 0) { setPreview(null); return; }
    const timer = setTimeout(() => {
      previewMutation.mutate({
        entryType: formData.entryType,
        entryPurpose: formData.entryPurpose,
        daysWorked: formData.daysWorked,
        hoursWorked: formData.hoursWorked,
        quantity: formData.quantity,
        baseRate: formData.baseRate,
        overtimeHours: formData.overtimeHours,
        overtimeRateMultiplier: formData.overtimeRateMultiplier,
        periodId: formData.periodId ? parseInt(formData.periodId) : undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [formData.entryType, formData.entryPurpose, formData.daysWorked, formData.hoursWorked, formData.quantity, formData.baseRate, formData.overtimeHours, formData.overtimeRateMultiplier, formData.periodId]);

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['/api/manual-salary/list'] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/manual-salary/create', data),
    onSuccess: () => {
      toast({ title: 'Contract worker salary created' });
      invalidateList();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PUT', `/api/manual-salary/${id}`, data),
    onSuccess: () => {
      toast({ title: 'Entry updated successfully' });
      invalidateList();
      setIsEditOpen(false);
      setEditingEntry(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/manual-salary/${id}`),
    onSuccess: () => {
      toast({ title: 'Entry deleted' });
      invalidateList();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: number; action: string; reason?: string }) =>
      apiRequest('POST', `/api/manual-salary/${id}/status`, { action, reason }),
    onSuccess: (_: any, vars: any) => {
      const labels: Record<string, string> = { verify: 'verified', hold: 'put on hold', reject: 'rejected', reopen: 'reopened' };
      toast({ title: `Entry ${labels[vars.action] || vars.action} successfully` });
      invalidateList();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const sapPostMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/manual-salary/${id}/post-sap`),
    onSuccess: () => {
      toast({ title: 'Posted to SAP successfully' });
      invalidateList();
    },
    onError: (e: any) => toast({ title: 'SAP Posting Error', description: e.message, variant: 'destructive' }),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/manual-salary/${id}/reverse-sap`),
    onSuccess: () => {
      toast({ title: 'Reversal JE posted to SAP successfully' });
      invalidateList();
    },
    onError: (e: any) => toast({ title: 'Reversal Error', description: e.message, variant: 'destructive' }),
  });

  const lastMonthPeriodId = useMemo(() => {
    if (!periods.length) return '';
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const match = periods.find((p: any) => {
      const start = new Date(p.startDate);
      return start.getFullYear() === lastMonth.getFullYear() && start.getMonth() === lastMonth.getMonth();
    });
    return match ? match.id.toString() : '';
  }, [periods]);

  function resetForm() {
    setFormData({
      periodId: lastMonthPeriodId, userId: '', entryType: 'daily', daysWorked: '0', hoursWorked: '0',
      quantity: '0', baseRate: '', overtimeHours: '0', overtimeRateMultiplier: '1.5', entryPurpose: 'ot_only', remarks: '',
    });
  }

  function handleSubmit() {
    const isOtOnlySubmit = formData.entryPurpose === 'ot_only';
    if (isOtOnlySubmit) {
      if (!formData.periodId || !formData.userId) {
        toast({ title: 'Please select worker and period', variant: 'destructive' });
        return;
      }
    } else {
      if (!formData.periodId || !formData.userId || !formData.baseRate) {
        toast({ title: 'Please fill in worker, period, and base rate', variant: 'destructive' });
        return;
      }
    }
    createMutation.mutate({
      periodId: parseInt(formData.periodId),
      userId: parseInt(formData.userId),
      entryType: formData.entryType,
      entryPurpose: formData.entryPurpose,
      daysWorked: formData.daysWorked,
      hoursWorked: formData.hoursWorked,
      quantity: formData.quantity,
      baseRate: formData.baseRate || '0',
      overtimeHours: formData.overtimeHours,
      overtimeRateMultiplier: formData.overtimeRateMultiplier,
      remarks: formData.remarks,
    });
  }

  function openEdit(entry: any) {
    setEditingEntry(entry);
    setFormData({
      periodId: String(entry.periodId),
      userId: String(entry.userId),
      entryType: entry.entryType || 'daily',
      daysWorked: entry.daysWorked || '0',
      hoursWorked: entry.hoursWorked || '0',
      quantity: entry.quantity || '0',
      baseRate: entry.baseRate || '',
      overtimeHours: entry.overtimeHours || '0',
      overtimeRateMultiplier: entry.overtimeRateMultiplier || '1.5',
      entryPurpose: entry.entryPurpose || 'ot_only',
      remarks: entry.remarks || '',
    });
    setIsEditOpen(true);
  }

  function handleUpdate() {
    if (!editingEntry) return;
    updateMutation.mutate({
      id: editingEntry.id,
      data: {
        entryType: formData.entryType,
        daysWorked: formData.daysWorked,
        hoursWorked: formData.hoursWorked,
        quantity: formData.quantity,
        baseRate: formData.baseRate,
        overtimeHours: formData.overtimeHours,
        overtimeRateMultiplier: formData.overtimeRateMultiplier,
        remarks: formData.remarks,
      },
    });
  }

  function handleActionWithReason(entryId: number, action: string) {
    setReasonDialog({ open: true, entryId, action });
    setReasonText('');
  }

  function submitReasonAction() {
    statusMutation.mutate({ id: reasonDialog.entryId, action: reasonDialog.action, reason: reasonText });
    setReasonDialog({ open: false, entryId: 0, action: '' });
  }

  const summaryStats = useMemo(() => {
    const total = entries.length;
    const generated = entries.filter((e: any) => e.payrollStatus === 'generated').length;
    const verified = entries.filter((e: any) => e.payrollStatus === 'verified').length;
    const transferred = entries.filter((e: any) => e.payrollStatus === 'transferred').length;
    const totalGross = entries.reduce((s: number, e: any) => s + parseFloat(e.grossEarnings || '0'), 0);
    const totalNet = entries.reduce((s: number, e: any) => s + parseFloat(e.netPay || '0'), 0);
    return { total, generated, verified, transferred, totalGross, totalNet };
  }, [entries]);

  const sapJePreview = useMemo(() => {
    if (!preview) return null;
    const selectedUser = allUsers.find((u: any) => u.id === parseInt(formData.userId));
    if (!selectedUser) return null;
    const selectedPeriod = periods.find((p: any) => p.id === parseInt(formData.periodId));

    const empName = selectedUser.cardName || (selectedUser.firstName && selectedUser.lastName ? `${selectedUser.firstName} ${selectedUser.lastName}` : selectedUser.username);
    const periodLabel = selectedPeriod?.periodName || 'Unknown Period';

    const getGl = (code: string, context: string) => {
      const m = glMappings.find((g: any) => g.componentCode === code && g.postingContext === context && g.isActive);
      return (m?.sapAcctCode && m.sapAcctCode.trim() !== '' ? m.sapAcctCode : m?.glAccountCode) || `[${code}_${context}]`;
    };

    const postingDate = selectedPeriod?.startDate
      ? (() => { const sd = new Date(selectedPeriod.startDate); return new Date(sd.getFullYear(), sd.getMonth() + 1, 0).toISOString().split('T')[0]; })()
      : new Date().toISOString().split('T')[0];

    const isOtOnlyPreview = formData.entryPurpose === 'ot_only';

    if (isOtOnlyPreview) {
      const otAmount = preview.overtimeEarned || preview.netPay || 0;
      return {
        ReferenceDate: postingDate,
        TaxDate: postingDate,
        DueDate: postingDate,
        Memo: `Manual Overtime Entry - ${empName} - ${periodLabel}`,
        Reference: 'OT-ENTRY-<id>',
        Reference2: selectedUser.cardCode || '[NO_CARD_CODE]',
        U_Employee_Name: empName,
        JournalEntryLines: [
          {
            AccountCode: getGl('OVERTIME', 'expense'),
            Debit: otAmount,
            Credit: 0,
            LineMemo: `Manual OT Expense - ${empName} - ${periodLabel}`,
          },
          {
            AccountCode: getGl('NET_PAY', 'payroll_liability'),
            ShortName: selectedUser.cardCode || '[NO_CARD_CODE]',
            Debit: 0,
            Credit: otAmount,
            LineMemo: `Manual OT Payable - ${empName} - ${periodLabel}`,
          },
        ],
      };
    }

    const jeLines: any[] = [];

    if (preview.baseEarnings > 0) {
      jeLines.push({ AccountCode: getGl('BASIC', 'expense'), Debit: preview.baseEarnings, Credit: 0, LineMemo: `Manual Salary BASIC - ${empName} - ${periodLabel}` });
    }
    if (preview.overtimeEarned > 0) {
      jeLines.push({ AccountCode: getGl('OVERTIME', 'expense'), Debit: preview.overtimeEarned, Credit: 0, LineMemo: `Manual Salary OVERTIME - ${empName} - ${periodLabel}` });
    }
    if (preview.pfAmount > 0) {
      jeLines.push({ AccountCode: getGl('PF_EMPLOYEE', 'payroll_liability'), Debit: 0, Credit: preview.pfAmount, LineMemo: `Manual Salary PF - ${empName} - ${periodLabel}` });
    }
    if (preview.esicAmount > 0) {
      jeLines.push({ AccountCode: getGl('ESIC_EMPLOYEE', 'payroll_liability'), Debit: 0, Credit: preview.esicAmount, LineMemo: `Manual Salary ESIC - ${empName} - ${periodLabel}` });
    }
    if (preview.ptAmount > 0) {
      jeLines.push({ AccountCode: getGl('PT', 'payroll_liability'), Debit: 0, Credit: preview.ptAmount, LineMemo: `Manual Salary PT - ${empName} - ${periodLabel}` });
    }
    if (preview.tdsAmount > 0) {
      jeLines.push({ AccountCode: getGl('TDS', 'payroll_liability'), Debit: 0, Credit: preview.tdsAmount, LineMemo: `Manual Salary TDS - ${empName} - ${periodLabel}` });
    }
    if (preview.netPay > 0) {
      jeLines.push({ AccountCode: getGl('NET_PAY', 'payroll_liability'), Debit: 0, Credit: preview.netPay, LineMemo: `Manual Salary Net Pay - ${empName} - ${periodLabel}` });
    }

    return {
      ReferenceDate: postingDate,
      TaxDate: postingDate,
      DueDate: postingDate,
      Memo: `Manual Salary JE - ${empName} - ${periodLabel}`,
      Reference: 'MS-ENTRY-<id>',
      Reference2: selectedUser.cardCode || '[NO_CARD_CODE]',
      Reference3: '194C',
      U_Employee_Name: empName,
      U_TDS_Status: 'A',
      U_PF_Status: 'A',
      U_ESIC_Status: 'A',
      U_PT_Status: 'A',
      JournalEntryLines: jeLines,
    };
  }, [preview, formData.userId, formData.periodId, allUsers, periods, glMappings]);

  const [showJePreview, setShowJePreview] = useState(false);

  function renderFormFields(isEdit: boolean) {
    const isOtOnly = formData.entryPurpose === 'ot_only';
    return (
      <div className="space-y-4">
        {!isEdit && (
          <>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
            <span className="font-medium">OT Only (Attendance via Calendar)</span> — Base salary is processed through the Payroll Run Engine using calendar attendance. This entry captures overtime hours only.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payroll Period *</Label>
              <Select value={formData.periodId} onValueChange={v => setFormData(d => ({ ...d, periodId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.periodName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Worker *</Label>
              <Select value={formData.userId} onValueChange={v => setFormData(d => ({ ...d, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                <SelectContent>
                  {allUsers.filter((u: any) => u.isActive && u.otApplicable === 'yes').map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.cardName || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username)}
                      {u.employeeCode ? ` (${u.employeeCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          </>
        )}


        {!isOtOnly && (
          <>
            <Separator />
            <h4 className="font-semibold text-sm">Work Details</h4>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Entry Type</Label>
                <Select value={formData.entryType} onValueChange={v => setFormData(d => ({ ...d, entryType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily (Days x Rate)</SelectItem>
                    <SelectItem value="hourly">Hourly (Hrs x Rate)</SelectItem>
                    <SelectItem value="piece">Piece Rate (Qty x Rate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.entryType === 'daily' && (
                <div>
                  <Label>Days Worked</Label>
                  <Input type="number" step="0.5" value={formData.daysWorked} onChange={e => setFormData(d => ({ ...d, daysWorked: e.target.value }))} />
                </div>
              )}
              {formData.entryType === 'hourly' && (
                <div>
                  <Label>Hours Worked</Label>
                  <Input type="number" step="0.5" value={formData.hoursWorked} onChange={e => setFormData(d => ({ ...d, hoursWorked: e.target.value }))} />
                </div>
              )}
              {formData.entryType === 'piece' && (
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" step="1" value={formData.quantity} onChange={e => setFormData(d => ({ ...d, quantity: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>Base Rate (INR) *</Label>
                <Input type="number" step="0.01" value={formData.baseRate} onChange={e => setFormData(d => ({ ...d, baseRate: e.target.value }))} placeholder="e.g. 800" />
              </div>
            </div>
          </>
        )}

        <Separator />
        <h4 className="font-semibold text-sm">Overtime</h4>

        <div className={`grid ${isOtOnly ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
          {isOtOnly && (
            <div>
              <Label>Hourly Rate (INR) *</Label>
              <Input type="number" step="0.01" value={formData.baseRate} onChange={e => setFormData(d => ({ ...d, baseRate: e.target.value }))} placeholder="e.g. 100" />
            </div>
          )}
          <div>
            <Label>Overtime Hours *</Label>
            <Input type="number" step="0.5" value={formData.overtimeHours} onChange={e => setFormData(d => ({ ...d, overtimeHours: e.target.value }))} />
          </div>
          <div>
            <Label>OT Rate Multiplier</Label>
            <Input type="number" step="0.1" value={formData.overtimeRateMultiplier} onChange={e => setFormData(d => ({ ...d, overtimeRateMultiplier: e.target.value }))} />
          </div>
        </div>

        <div>
          <Label>Remarks</Label>
          <Textarea value={formData.remarks} onChange={e => setFormData(d => ({ ...d, remarks: e.target.value }))} placeholder="Optional notes..." rows={2} />
        </div>

        {preview && (
          <>
            <Separator />
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" /> Live Calculation Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  {!isOtOnly && preview.baseEarnings > 0 && (
                    <div className="flex justify-between"><span>Base Pay:</span><span className="font-mono">{fmt(preview.baseEarnings)}</span></div>
                  )}
                  <div className="flex justify-between"><span>Overtime:</span><span className="font-mono">{fmt(preview.overtimeEarned)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Gross:</span><span className="font-mono">{fmt(preview.grossEarnings)}</span></div>
                  {preview.totalDeductions > 0 && (
                    <div className="flex justify-between text-red-600"><span>Deductions:</span><span className="font-mono">{fmt(preview.totalDeductions)}</span></div>
                  )}
                  <div className="flex justify-between text-green-700 font-bold text-base"><span>Net Pay:</span><span className="font-mono">{fmt(preview.netPay)}</span></div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Hourly Rate: {fmt(parseFloat(formData.baseRate || '0'))} × {formData.overtimeHours} hrs × {formData.overtimeRateMultiplier} = {fmt(preview.overtimeEarned)}
                </div>
              </CardContent>
            </Card>

            {sapJePreview && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="p-3 pb-1 cursor-pointer" onClick={() => setShowJePreview(!showJePreview)}>
                  <CardTitle className="text-sm flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2"><Send className="h-4 w-4" /> SAP JE Preview</span>
                    <span className="text-xs text-muted-foreground">{showJePreview ? '▲ Hide' : '▼ Show'}</span>
                  </CardTitle>
                </CardHeader>
                {showJePreview && (
                  <CardContent className="p-3 pt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b bg-blue-100/50">
                            <th className="text-left p-1.5 font-medium">#</th>
                            <th className="text-left p-1.5 font-medium">Account</th>
                            <th className="text-right p-1.5 font-medium">Debit</th>
                            <th className="text-right p-1.5 font-medium">Credit</th>
                            <th className="text-left p-1.5 font-medium">Memo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sapJePreview.JournalEntryLines.map((line: any) => (
                            <tr key={line.Line_ID} className="border-b">
                              <td className="p-1.5 text-muted-foreground">{line.Line_ID}</td>
                              <td className="p-1.5 font-mono text-xs">{line.AccountCode}</td>
                              <td className="p-1.5 text-right font-mono">{line.Debit > 0 ? fmt(line.Debit) : '-'}</td>
                              <td className="p-1.5 text-right font-mono">{line.Credit > 0 ? fmt(line.Credit) : '-'}</td>
                              <td className="p-1.5 text-muted-foreground truncate max-w-[200px]">{line.LineMemo}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-bold text-xs">
                            <td colSpan={2} className="p-1.5">Total</td>
                            <td className="p-1.5 text-right font-mono">{fmt(sapJePreview.JournalEntryLines.reduce((s: number, l: any) => s + l.Debit, 0))}</td>
                            <td className="p-1.5 text-right font-mono">{fmt(sapJePreview.JournalEntryLines.reduce((s: number, l: any) => s + l.Credit, 0))}</td>
                            <td className="p-1.5"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Raw JSON</summary>
                      <pre className="mt-1 p-2 bg-slate-900 text-green-400 rounded text-[10px] overflow-x-auto max-h-[200px]">{JSON.stringify(sapJePreview, null, 2)}</pre>
                    </details>
                  </CardContent>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-6 w-6 text-orange-600" />
          <div>
            <h3 className="text-lg font-semibold">Manual Salary Processing</h3>
            <p className="text-sm text-muted-foreground">Manual overtime entry — separate from payroll run engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Periods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Periods</SelectItem>
              {periods.map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.periodName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="bg-orange-600 hover:bg-orange-700">
            <Plus className="h-4 w-4 mr-2" /> New Entry
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-blue-600">{summaryStats.total}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-slate-600">{summaryStats.generated}</div><div className="text-xs text-muted-foreground">Generated</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-emerald-600">{summaryStats.verified}</div><div className="text-xs text-muted-foreground">Verified</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-purple-600">{summaryStats.transferred}</div><div className="text-xs text-muted-foreground">Transferred</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-orange-600">{fmt(summaryStats.totalGross)}</div><div className="text-xs text-muted-foreground">Total Gross</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-green-600">{fmt(summaryStats.totalNet)}</div><div className="text-xs text-muted-foreground">Total Net</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading entries...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">No manual salary entries</p>
              <p className="text-sm">Click "New Entry" to create a manual salary record.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left p-3 font-medium">Worker</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Days/Hrs</th>
                    <th className="text-right p-3 font-medium">Rate</th>
                    <th className="text-right p-3 font-medium">Base</th>
                    <th className="text-right p-3 font-medium">OT</th>
                    <th className="text-right p-3 font-medium">Gross</th>
                    <th className="text-right p-3 font-medium">Deductions</th>
                    <th className="text-right p-3 font-medium">Net Pay</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-center p-3 font-medium">SAP</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => {
                    const workerName = e.cardName || (e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.userName);
                    const isOtOnly = parseFloat(e.baseEarnings || '0') === 0 && parseFloat(e.overtimeEarned || '0') > 0;
                    const daysOrHrs = isOtOnly
                      ? `${e.overtimeHours || 0}h`
                      : e.entryType === 'daily' ? `${e.daysWorked}d` : e.entryType === 'hourly' ? `${e.hoursWorked}h` : `${e.quantity}q`;
                    const displayType = isOtOnly ? 'OT Only' : e.entryType;
                    return (
                      <tr key={e.id} className="border-b hover:bg-gray-50/50">
                        <td className="p-3">
                          <div className="font-medium">{workerName}</div>
                          <div className="text-xs text-muted-foreground">{e.employeeCode || e.department || ''}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={isOtOnly ? "text-purple-700 border-purple-300 bg-purple-50" : "text-orange-700 border-orange-300 bg-orange-50"}>{displayType}</Badge>
                        </td>
                        <td className="p-3 text-right font-mono">{daysOrHrs}</td>
                        <td className="p-3 text-right font-mono">{fmt(e.baseRate)}</td>
                        <td className="p-3 text-right font-mono">{isOtOnly ? '--' : fmt(e.baseEarnings)}</td>
                        <td className="p-3 text-right font-mono">{parseFloat(e.overtimeEarned || '0') > 0 ? fmt(e.overtimeEarned) : '--'}</td>
                        <td className="p-3 text-right font-mono font-semibold">{fmt(e.grossEarnings)}</td>
                        <td className="p-3 text-right font-mono text-red-600">{fmt(e.totalDeductions)}</td>
                        <td className="p-3 text-right font-mono font-semibold text-green-700">{fmt(e.netPay)}</td>
                        <td className="p-3 text-center"><StatusBadge status={e.payrollStatus} /></td>
                        <td className="p-3 text-center"><SapBadge sapPostingStatus={e.sapPostingStatus} sapJeNumber={e.sapJeNumber} /></td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {e.payrollStatus === 'generated' && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700" onClick={() => openEdit(e)} title="Edit">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700" onClick={() => statusMutation.mutate({ id: e.id, action: 'verify' })}>
                                  <ShieldCheck className="h-3 w-3 mr-1" /> Verify
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700" onClick={() => handleActionWithReason(e.id, 'hold')}>
                                  <Pause className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-red-700" onClick={() => handleActionWithReason(e.id, 'reject')}>
                                  <XCircle className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => deleteMutation.mutate(e.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {e.payrollStatus === 'verified' && e.sapPostingStatus !== 'posted' && (
                              <>
                                <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => sapPostMutation.mutate(e.id)} disabled={sapPostMutation.isPending}>
                                  <Send className="h-3 w-3 mr-1" /> Post SAP
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700" onClick={() => handleActionWithReason(e.id, 'hold')}>
                                  <Pause className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {e.payrollStatus === 'transferred' && e.sapPostingStatus === 'posted' && !e.reversalSapJeNumber && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-gray-700" onClick={() => reverseMutation.mutate(e.id)} disabled={reverseMutation.isPending}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Reverse
                              </Button>
                            )}
                            {(e.payrollStatus === 'held' || e.payrollStatus === 'rejected') && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => statusMutation.mutate({ id: e.id, action: 'reopen' })}>
                                <Undo2 className="h-3 w-3 mr-1" /> Reopen
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-600" /> Manual Over Time Entry
            </DialogTitle>
          </DialogHeader>
          {renderFormFields(false)}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><Plus className="h-4 w-4 mr-2" /> Create Entry</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setEditingEntry(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" /> Edit Manual Salary Entry
            </DialogTitle>
          </DialogHeader>
          {renderFormFields(true)}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingEntry(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><CheckCircle className="h-4 w-4 mr-2" /> Save Changes</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reasonDialog.open} onOpenChange={o => setReasonDialog(d => ({ ...d, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reasonDialog.action === 'hold' ? 'Hold Entry' : 'Reject Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Enter reason..." rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReasonDialog({ open: false, entryId: 0, action: '' })}>Cancel</Button>
              <Button onClick={submitReasonAction} disabled={!reasonText.trim()} className={reasonDialog.action === 'hold' ? 'bg-amber-600' : 'bg-red-600'}>
                {reasonDialog.action === 'hold' ? 'Hold' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
