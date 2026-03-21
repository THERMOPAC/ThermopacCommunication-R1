import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, FileText, CheckCircle, Clock, AlertTriangle, IndianRupee, Users, Download, CreditCard, Undo2, Upload } from "lucide-react";
import Layout from "@/components/layout";
import SapBankAccountDialog from "@/components/sap-bank-account-dialog";

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  calculated: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-orange-100 text-orange-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  filed: 'bg-purple-100 text-purple-800',
  not_posted: 'bg-gray-100 text-gray-600',
};

const MODULE_CONFIG: Record<string, {
  title: string; description: string; filingPeriodType: string;
  formType: string; employeeLabel: string; employerLabel: string;
  hasEmployer: boolean; extraFields: string[];
}> = {
  TDS: {
    title: 'TDS Compliance',
    description: 'Tax Deducted at Source — Section 192 (Salary)',
    filingPeriodType: 'quarterly',
    formType: '24Q',
    employeeLabel: 'TDS Deducted',
    employerLabel: '',
    hasEmployer: false,
    extraFields: ['bsrCode', 'cinNumber'],
  },
  PF: {
    title: 'PF Compliance',
    description: 'Provident Fund — Employee & Employer Contributions',
    filingPeriodType: 'monthly',
    formType: 'ECR',
    employeeLabel: 'Employee PF',
    employerLabel: 'Employer PF',
    hasEmployer: true,
    extraFields: ['establishmentCode', 'trrnNumber'],
  },
  ESIC: {
    title: 'ESIC Compliance',
    description: 'Employee State Insurance Corporation',
    filingPeriodType: 'half-yearly',
    formType: '',
    employeeLabel: 'Employee ESIC',
    employerLabel: 'Employer ESIC',
    hasEmployer: true,
    extraFields: ['esicEmployerCode'],
  },
  PT: {
    title: 'PT Compliance',
    description: 'Professional Tax — State-wise Deductions',
    filingPeriodType: 'monthly',
    formType: '',
    employeeLabel: 'PT Deducted',
    employerLabel: '',
    hasEmployer: false,
    extraFields: ['ptrcNumber', 'grnNumber'],
  },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(val?.toString() || '0');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  moduleType: 'TDS' | 'PF' | 'ESIC' | 'PT';
  embedded?: boolean;
}

export default function StatutoryCompliancePage({ moduleType, embedded }: Props) {
  const { toast } = useToast();
  const config = MODULE_CONFIG[moduleType];
  const [selectedTab, setSelectedTab] = useState('dashboard');
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showFilingDialog, setShowFilingDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<any>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [ptState, setPtState] = useState<string>('');
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: '', paymentMode: 'online', paymentReference: '', bankName: '',
    challanSerial: '', bsrCode: '', cinNumber: '', trrnNumber: '', grnNumber: '',
    esicEmployerCode: '', establishmentCode: '', ptrcNumber: '',
    interest: '0', penalty: '0',
  });
  const [filingForm, setFilingForm] = useState({
    filingPeriod: '', filingDate: '', acknowledgementNumber: '', remarks: '', formType: config.formType,
  });

  const currentFY = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return m >= 3 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`;
  }, []);

  const [filterFY, setFilterFY] = useState(currentFY);

  const { data: challans = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/challans', { moduleType, financialYear: filterFY }],
    queryFn: () => fetch(`/api/statutory/challans?moduleType=${moduleType}&financialYear=${filterFY}`).then(r => r.json()),
  });

  const { data: periods = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/payroll-periods/finalized'],
  });

  const { data: filings = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/filing-status', { moduleType, financialYear: filterFY }],
    queryFn: () => fetch(`/api/statutory/filing-status?moduleType=${moduleType}&financialYear=${filterFY}`).then(r => r.json()),
  });

  const { data: reconciliation = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/reconciliation', moduleType, filterFY],
    queryFn: () => fetch(`/api/statutory/reconciliation/${moduleType}?financialYear=${filterFY}`).then(r => r.json()),
  });

  const { data: glValidation } = useQuery<any>({
    queryKey: ['/api/statutory/gl-mappings/validate', moduleType],
    queryFn: () => fetch(`/api/statutory/gl-mappings/validate/${moduleType}`).then(r => r.json()),
  });

  const { data: ptConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/pt-state-config'],
    enabled: moduleType === 'PT',
  });

  const generateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/statutory/challans/generate', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/reconciliation'] });
      setShowGenerateDialog(false);
      toast({ title: 'Challan generated from payroll data' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/statutory/challans/${id}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      setShowPaymentDialog(false);
      toast({ title: 'Payment recorded' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filingMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/statutory/challans/${id}/filing`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      toast({ title: 'Filing status updated' });
    },
  });

  const [showSapPostDialog, setShowSapPostDialog] = useState(false);
  const [sapChallanTarget, setSapChallanTarget] = useState<{ id: number } | null>(null);

  const postSapMutation = useMutation({
    mutationFn: ({ id, bankAccountCode }: { id: number; bankAccountCode: string }) =>
      apiRequest('POST', `/api/statutory/challans/${id}/post-sap`, { bankAccountCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      setShowSapPostDialog(false);
      setSapChallanTarget(null);
      toast({ title: 'Challan posted to SAP' });
    },
    onError: (e: any) => toast({ title: 'SAP Posting Error', description: e.message, variant: 'destructive' }),
  });

  const reverseSapMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('POST', `/api/statutory/challans/${id}/reverse-sap`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      toast({ title: 'Challan reversal posted to SAP' });
    },
    onError: (e: any) => toast({ title: 'SAP Reversal Error', description: e.message, variant: 'destructive' }),
  });

  const deleteChallanMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/statutory/challans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/compliance-register'] });
      toast({ title: 'Challan deleted successfully' });
    },
    onError: (e: any) => toast({ title: 'Delete Error', description: e.message, variant: 'destructive' }),
  });

  const createFilingMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/statutory/filing-status', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/filing-status'] });
      setShowFilingDialog(false);
      toast({ title: 'Filing record created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const detailQuery = useQuery<any>({
    queryKey: ['/api/statutory/challans', selectedChallan?.id],
    queryFn: () => fetch(`/api/statutory/challans/${selectedChallan?.id}`).then(r => r.json()),
    enabled: !!selectedChallan?.id && showDetailDialog,
  });

  const totalDeducted = challans.reduce((s: number, c: any) => s + parseFloat(c.totalEmployeeContribution || '0'), 0);
  const totalEmployer = challans.reduce((s: number, c: any) => s + parseFloat(c.totalEmployerContribution || '0'), 0);
  const totalPaid = challans.filter((c: any) => ['paid', 'filed'].includes(c.status)).reduce((s: number, c: any) => s + parseFloat(c.totalAmount || '0'), 0);
  const pendingCount = challans.filter((c: any) => c.status === 'calculated').length;

  function getStatutoryDueDate(challanMonth: number, challanYear: number, modType: string): Date {
    if (modType === 'TDS') {
      if (challanMonth === 3) return new Date(challanYear, 3, 30);
      return new Date(challanYear, challanMonth, 7);
    }
    if (modType === 'PF') return new Date(challanYear, challanMonth, 15);
    if (modType === 'ESIC') return new Date(challanYear, challanMonth, 15);
    if (modType === 'PT') return new Date(challanYear, challanMonth, 10);
    return new Date(challanYear, challanMonth, 7);
  }

  function calcInterest(challan: any, paymentDateStr: string): string {
    if (!challan || !paymentDateStr) return '0';
    const dueDate = getStatutoryDueDate(challan.month, challan.year, moduleType);
    const payDate = new Date(paymentDateStr);
    if (payDate <= dueDate) return '0';

    const diffMs = payDate.getTime() - dueDate.getTime();
    const delayDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const delayMonths = Math.ceil(delayDays / 30);

    const base = parseFloat(challan.totalEmployeeContribution?.toString() || '0')
               + parseFloat(challan.totalEmployerContribution?.toString() || '0');

    let ratePerMonth = 0;
    if (moduleType === 'TDS') ratePerMonth = 0.015;
    else if (moduleType === 'PF') ratePerMonth = 0.01;
    else if (moduleType === 'ESIC') ratePerMonth = 0.01;
    else if (moduleType === 'PT') ratePerMonth = 0.0125;

    return Math.round(base * ratePerMonth * delayMonths).toString();
  }

  function openPaymentDialog(challan: any) {
    setSelectedChallan(challan);
    const today = new Date().toISOString().split('T')[0];
    const interest = calcInterest(challan, today);
    setPaymentForm({
      paymentDate: today, paymentMode: 'online', paymentReference: '', bankName: '',
      challanSerial: '', bsrCode: challan.bsrCode || '', cinNumber: '', trrnNumber: '', grnNumber: '',
      esicEmployerCode: challan.esicEmployerCode || '', establishmentCode: challan.establishmentCode || '',
      ptrcNumber: challan.ptrcNumber || '', interest, penalty: '0',
    });
    setShowPaymentDialog(true);
  }

  function openDetail(challan: any) {
    setSelectedChallan(challan);
    setShowDetailDialog(true);
  }

  const fyOptions = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => {
      const start = y - 2 + i;
      return `${start}-${(start + 1).toString().slice(2)}`;
    });
  }, []);

  const content = (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{config.title}</h1>
          <p className="text-muted-foreground mt-1">{config.description}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filterFY} onValueChange={setFilterFY}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fyOptions.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowGenerateDialog(true)}>Generate Challan</Button>
        </div>
      </div>

      {glValidation && !glValidation.valid && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <div>
              <span className="font-medium text-orange-800">GL Mapping Incomplete — </span>
              <span className="text-orange-700">Missing mappings for: {glValidation.missing?.join(', ')}. SAP posting will be blocked until all mappings are configured.</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="challans">Challans</TabsTrigger>
          <TabsTrigger value="filing">Filing</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <IndianRupee className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{fmt(totalDeducted)}</div>
                    <div className="text-sm text-muted-foreground">{config.employeeLabel} (YTD)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            {config.hasEmployer && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <IndianRupee className="h-8 w-8 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold">{fmt(totalEmployer)}</div>
                      <div className="text-sm text-muted-foreground">{config.employerLabel} (YTD)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{fmt(totalPaid)}</div>
                    <div className="text-sm text-muted-foreground">Total Deposited</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold">{pendingCount}</div>
                    <div className="text-sm text-muted-foreground">Pending Payment</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Monthly Summary — FY {filterFY}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">{config.employeeLabel}</TableHead>
                    {config.hasEmployer && <TableHead className="text-right">{config.employerLabel}</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {challans.length === 0 ? (
                    <TableRow><TableCell colSpan={config.hasEmployer ? 6 : 5} className="text-center py-8 text-muted-foreground">No challans generated yet for FY {filterFY}</TableCell></TableRow>
                  ) : challans.map((c: any) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c)}>
                      <TableCell>{new Date(c.year, c.month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(c.totalEmployeeContribution)}</TableCell>
                      {config.hasEmployer && <TableCell className="text-right font-mono">{fmt(c.totalEmployerContribution)}</TableCell>}
                      <TableCell className="text-right font-mono font-semibold">{fmt(c.totalAmount)}</TableCell>
                      <TableCell className="text-right">{c.employeeCount}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="challans" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Challan Register — FY {filterFY}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Period</TableHead>
                    {moduleType === 'PT' && <TableHead>State</TableHead>}
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Payment Ref</TableHead>
                    {moduleType === 'TDS' && <TableHead>BSR / CIN</TableHead>}
                    {moduleType === 'PF' && <TableHead>TRRN</TableHead>}
                    <TableHead>SAP JE</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {challans.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No challans found</TableCell></TableRow>
                  ) : challans.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.challanReference}</TableCell>
                      <TableCell>{new Date(c.year, c.month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</TableCell>
                      {moduleType === 'PT' && <TableCell>{c.state || '—'}</TableCell>}
                      <TableCell className="text-right font-mono">{fmt(c.totalAmount)}</TableCell>
                      <TableCell>{fmtDate(c.paymentDate)}</TableCell>
                      <TableCell>{c.paymentReference || '—'}</TableCell>
                      {moduleType === 'TDS' && <TableCell className="text-sm">{c.bsrCode || '—'} / {c.cinNumber || '—'}</TableCell>}
                      {moduleType === 'PF' && <TableCell>{c.trrnNumber || '—'}</TableCell>}
                      <TableCell>{c.sapJeReference || c.sapJeNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[c.sapPostingStatus || c.status]}>{c.sapPostingStatus || c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(c)}>View</Button>
                          {c.status === 'calculated' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openPaymentDialog(c)}><CreditCard className="h-3 w-3 mr-1" />Pay</Button>
                              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm(`Delete challan ${c.challanReference}? This will remove the challan and its employee details.`)) {
                                    deleteChallanMutation.mutate(c.id);
                                  }
                                }}>Delete</Button>
                            </>
                          )}
                          {c.status === 'paid' && (!c.sapPostingStatus || c.sapPostingStatus === 'not_posted' || c.sapPostingStatus === 'failed') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => filingMutation.mutate({ id: c.id })}><FileText className="h-3 w-3 mr-1" />File</Button>
                              <Button size="sm" variant="outline" onClick={() => {
                                setSapChallanTarget({ id: c.id });
                                setSapPostAction('post');
                                setShowSapPostDialog(true);
                              }}><Upload className="h-3 w-3 mr-1" />Post SAP</Button>
                            </>
                          )}
                          {c.sapPostingStatus === 'posted' && !c.reversalSapDocEntry && (
                            <Button size="sm" variant="outline" className="text-orange-600"
                              disabled={reverseSapMutation.isPending}
                              onClick={() => {
                                if (confirm(`Reverse SAP JE for challan ${c.challanReference}? This will post a mirror reversal entry using the original bank account (${c.sapBankAccountCode || 'stored'}).`)) {
                                  reverseSapMutation.mutate(c.id);
                                }
                              }}><Undo2 className="h-3 w-3 mr-1" />Reverse</Button>
                          )}
                          {c.sapPostingStatus === 'reversed' && (
                            <Badge variant="outline" className="text-xs text-gray-500">Reversed</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filing" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Filing Tracker — FY {filterFY}</h3>
            <Button variant="outline" onClick={() => {
              setFilingForm({ filingPeriod: '', filingDate: '', acknowledgementNumber: '', remarks: '', formType: config.formType });
              setShowFilingDialog(true);
            }}><FileText className="h-4 w-4 mr-2" />Add Filing Record</Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    {config.formType && <TableHead>Form</TableHead>}
                    {moduleType === 'PT' && <TableHead>State</TableHead>}
                    <TableHead>Due Date</TableHead>
                    <TableHead>Filing Date</TableHead>
                    <TableHead>Acknowledgement</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No filing records</TableCell></TableRow>
                  ) : filings.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.filingPeriod}</TableCell>
                      {config.formType && <TableCell>{f.formType || config.formType}</TableCell>}
                      {moduleType === 'PT' && <TableCell>{f.state || '—'}</TableCell>}
                      <TableCell>{fmtDate(f.dueDate)}</TableCell>
                      <TableCell>{fmtDate(f.filingDate)}</TableCell>
                      <TableCell className="font-mono text-sm">{f.acknowledgementNumber || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(f.totalAmount)}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[f.status]}>{f.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Three-Way Reconciliation — FY {filterFY}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    {moduleType === 'TDS' && <TableHead>Section</TableHead>}
                    <TableHead className="text-right">Source Total</TableHead>
                    <TableHead className="text-right">Challan Total</TableHead>
                    <TableHead className="text-right">SAP Posted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Challan Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliation.length === 0 ? (
                    <TableRow><TableCell colSpan={moduleType === 'TDS' ? 7 : 6} className="text-center py-8 text-muted-foreground">Generate challans to see reconciliation data</TableCell></TableRow>
                  ) : reconciliation.map((r: any, i: number) => {
                    const variance = parseFloat(r.variance || '0');
                    return (
                      <TableRow key={i}>
                        <TableCell>{new Date(r.year, r.month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</TableCell>
                        {moduleType === 'TDS' && <TableCell className="font-mono text-sm">{r.tdsSection || '—'}</TableCell>}
                        <TableCell className="text-right font-mono" title={r.sourceLabel || 'Payroll Total'}>{fmt(r.payrollTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.challanTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.sapPosted)}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${variance !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt(r.variance)}
                        </TableCell>
                        <TableCell><Badge className={STATUS_COLORS[r.challanStatus]}>{r.challanStatus}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate {config.title} Challan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select a finalized payroll period to generate the challan. Amounts are calculated from payroll data and cannot be edited.</p>
            <div>
              <label className="text-sm font-medium">Payroll Period</label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods
                    .filter((p: any) => !challans.some((c: any) => c.payrollPeriodId === p.id))
                    .map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.periodName || `${new Date(p.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`} — {p.status}
                    </SelectItem>
                  ))}
                  {periods.filter((p: any) => !challans.some((c: any) => c.payrollPeriodId === p.id)).length === 0 && (
                    <SelectItem value="__none__" disabled>All finalized periods already have challans</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {moduleType === 'PT' && (
              <div>
                <label className="text-sm font-medium">State</label>
                <Select value={ptState} onValueChange={setPtState}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {ptConfigs.map((c: any) => <SelectItem key={c.id} value={c.state}>{c.state}</SelectItem>)}
                    <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                    <SelectItem value="Karnataka">Karnataka</SelectItem>
                    <SelectItem value="Gujarat">Gujarat</SelectItem>
                    <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
              <Button
                onClick={() => generateMutation.mutate({ moduleType, payrollPeriodId: parseInt(selectedPeriodId), state: moduleType === 'PT' ? ptState : undefined })}
                disabled={!selectedPeriodId || generateMutation.isPending}
              >
                Generate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Payment — {selectedChallan?.challanReference}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Payroll-Calculated Amount (read-only)</div>
              <div className="text-xl font-bold">{fmt(
                parseFloat(selectedChallan?.totalEmployeeContribution || '0') + parseFloat(selectedChallan?.totalEmployerContribution || '0')
              )}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Payment Date</label>
                <Input type="date" value={paymentForm.paymentDate} onChange={e => {
                  const newDate = e.target.value;
                  const newInterest = calcInterest(selectedChallan, newDate);
                  setPaymentForm(f => ({ ...f, paymentDate: newDate, interest: newInterest }));
                }} />
              </div>
              <div>
                <label className="text-sm font-medium">Payment Mode</label>
                <Select value={paymentForm.paymentMode} onValueChange={v => setPaymentForm(f => ({ ...f, paymentMode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="neft">NEFT</SelectItem>
                    <SelectItem value="rtgs">RTGS</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="demand_draft">Demand Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Payment Reference / Transaction No.</label>
              <Input value={paymentForm.paymentReference} onChange={e => setPaymentForm(f => ({ ...f, paymentReference: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Bank Name</label>
              <Input value={paymentForm.bankName} onChange={e => setPaymentForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            {moduleType === 'TDS' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">BSR Code</label>
                  <Input value={paymentForm.bsrCode} onChange={e => setPaymentForm(f => ({ ...f, bsrCode: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">CIN Number</label>
                  <Input value={paymentForm.cinNumber} onChange={e => setPaymentForm(f => ({ ...f, cinNumber: e.target.value }))} />
                </div>
              </div>
            )}
            {moduleType === 'PF' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Establishment Code</label>
                  <Input value={paymentForm.establishmentCode} onChange={e => setPaymentForm(f => ({ ...f, establishmentCode: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">TRRN Number</label>
                  <Input value={paymentForm.trrnNumber} onChange={e => setPaymentForm(f => ({ ...f, trrnNumber: e.target.value }))} />
                </div>
              </div>
            )}
            {moduleType === 'ESIC' && (
              <div>
                <label className="text-sm font-medium">ESIC Employer Code</label>
                <Input value={paymentForm.esicEmployerCode} onChange={e => setPaymentForm(f => ({ ...f, esicEmployerCode: e.target.value }))} />
              </div>
            )}
            {moduleType === 'PT' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">PTRC Number</label>
                  <Input value={paymentForm.ptrcNumber} onChange={e => setPaymentForm(f => ({ ...f, ptrcNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">GRN Number</label>
                  <Input value={paymentForm.grnNumber} onChange={e => setPaymentForm(f => ({ ...f, grnNumber: e.target.value }))} />
                </div>
              </div>
            )}
            {(() => {
              const dueDate = selectedChallan ? getStatutoryDueDate(selectedChallan.month, selectedChallan.year, moduleType) : null;
              const payDate = paymentForm.paymentDate ? new Date(paymentForm.paymentDate) : null;
              const isLate = dueDate && payDate && payDate > dueDate;
              const delayDays = isLate ? Math.ceil((payDate!.getTime() - dueDate!.getTime()) / (1000 * 60 * 60 * 24)) : 0;
              const rateLabel = moduleType === 'TDS' ? '1.5%' : moduleType === 'PT' ? '1.25%' : '1%';
              return (
                <>
                  {dueDate && (
                    <div className={`text-xs px-3 py-1.5 rounded ${isLate ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                      Due date: {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {isLate ? ` — Late by ${delayDays} day${delayDays > 1 ? 's' : ''} (${Math.ceil(delayDays / 30)} month${Math.ceil(delayDays / 30) > 1 ? 's' : ''} @ ${rateLabel}/month)` : ' — On time, no interest'}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Interest (auto-calculated)</label>
                      <Input type="number" value={paymentForm.interest} onChange={e => setPaymentForm(f => ({ ...f, interest: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Penalty (if any)</label>
                      <Input type="number" value={paymentForm.penalty} onChange={e => setPaymentForm(f => ({ ...f, penalty: e.target.value }))} />
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
              <Button onClick={() => paymentMutation.mutate({ id: selectedChallan?.id, ...paymentForm })} disabled={paymentMutation.isPending}>
                Record Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFilingDialog} onOpenChange={setShowFilingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Filing Record — {config.title}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Filing Period</label>
              <Input value={filingForm.filingPeriod} onChange={e => setFilingForm(f => ({ ...f, filingPeriod: e.target.value }))}
                placeholder={config.filingPeriodType === 'quarterly' ? 'e.g., Q1' : config.filingPeriodType === 'half-yearly' ? 'e.g., H1-2025-26' : 'e.g., Mar-2026'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Filing Date</label>
                <Input type="date" value={filingForm.filingDate} onChange={e => setFilingForm(f => ({ ...f, filingDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Acknowledgement No.</label>
                <Input value={filingForm.acknowledgementNumber} onChange={e => setFilingForm(f => ({ ...f, acknowledgementNumber: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Textarea value={filingForm.remarks} onChange={e => setFilingForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFilingDialog(false)}>Cancel</Button>
              <Button onClick={() => createFilingMutation.mutate({
                moduleType, financialYear: filterFY, ...filingForm,
                filingDate: filingForm.filingDate || null,
                status: filingForm.filingDate ? 'filed' : 'pending',
              })} disabled={createFilingMutation.isPending}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Challan Details — {selectedChallan?.challanReference}</DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="py-8 text-center">Loading...</div>
          ) : detailQuery.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted rounded">
                  <div className="text-sm text-muted-foreground">Period</div>
                  <div className="font-semibold">{new Date(detailQuery.data.year, detailQuery.data.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="text-sm text-muted-foreground">Total Amount</div>
                  <div className="font-semibold">{fmt(detailQuery.data.totalAmount)}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge className={STATUS_COLORS[detailQuery.data.status]}>{detailQuery.data.status}</Badge>
                </div>
              </div>

              {(() => {
                const isNonSalaryTds = moduleType === 'TDS' && selectedChallan?.tdsSection && selectedChallan.tdsSection !== '192';
                const entityLabel = isNonSalaryTds ? 'Deductee' : 'Employee';
                const codeLabel = isNonSalaryTds ? 'PAN' : 'Code';
                const baseLabel = isNonSalaryTds ? 'Base Amount' : 'Gross Salary';
                return (
                  <>
                    <h4 className="font-semibold mt-4">{entityLabel}-wise Breakdown ({detailQuery.data.details?.length || 0} {entityLabel.toLowerCase()}s)</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{entityLabel}</TableHead>
                          <TableHead>{codeLabel}</TableHead>
                          <TableHead className="text-right">{baseLabel}</TableHead>
                          <TableHead className="text-right">{config.employeeLabel}</TableHead>
                          {config.hasEmployer && <TableHead className="text-right">{config.employerLabel}</TableHead>}
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detailQuery.data.details || []).map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.employeeName}</TableCell>
                            <TableCell className="font-mono text-sm">{d.employeeCode || '—'}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(d.grossSalary)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(d.employeeContribution)}</TableCell>
                            {config.hasEmployer && <TableCell className="text-right font-mono">{fmt(d.employerContribution)}</TableCell>}
                            <TableCell className="text-right font-mono font-semibold">
                              {fmt(parseFloat(d.employeeContribution || '0') + parseFloat(d.employerContribution || '0'))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                );
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <SapBankAccountDialog
        open={showSapPostDialog}
        onOpenChange={(open) => { setShowSapPostDialog(open); if (!open) setSapChallanTarget(null); }}
        title="Post Statutory Challan to SAP"
        description="Select the bank account for the payment journal entry in SAP B1. This bank account will be stored and automatically used if you need to reverse later."
        onConfirm={(bankAccountCode) => {
          if (!sapChallanTarget) return;
          postSapMutation.mutate({ id: sapChallanTarget.id, bankAccountCode });
        }}
        isPending={postSapMutation.isPending}
      />
    </div>
  );

  if (embedded) return content;
  return <Layout>{content}</Layout>;
}
