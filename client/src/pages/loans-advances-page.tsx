import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getErrorMessage } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye, Pause, Play, XCircle, IndianRupee, Landmark, Wallet, ArrowLeft, Send, CheckCircle2, AlertCircle, Loader2, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import jsPDF from "jspdf";

function formatCurrency(val: number | string) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyPdf(val: number | string) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return `Rs. ${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    closed: 'bg-gray-100 text-gray-600',
    written_off: 'bg-red-100 text-red-700',
    deducted: 'bg-green-100 text-green-700',
    reversed: 'bg-orange-100 text-orange-700',
    pending: 'bg-blue-100 text-blue-700',
    partial: 'bg-yellow-100 text-yellow-700',
    skipped: 'bg-red-100 text-red-700',
  };
  return <Badge className={colors[status] || 'bg-gray-100'}>{status}</Badge>;
}

function generatePaymentMemoPdf(type: 'loan' | 'advance', record: any, action: 'view' | 'download' | 'print') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 15;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('THERMOPAC', pageW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Thermal Process Equipment Manufacturer', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  const memoTitle = type === 'loan' ? 'LOAN PAYMENT MEMO' : 'ADVANCE PAYMENT MEMO';
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(memoTitle, pageW / 2, y, { align: 'center' });
  y += 10;

  const reference = type === 'loan' ? record.loanReference : record.advanceReference;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Memo Ref: ${reference}`, margin, y);
  doc.text(`Date: ${today}`, pageW - margin, y, { align: 'right' });
  y += 12;

  const drawRow = (label: string, value: string, yPos: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 55, yPos);
    return yPos + 7;
  };

  doc.setFillColor(240, 245, 255);
  doc.rect(margin, y - 4, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EMPLOYEE DETAILS', margin + 2, y + 1);
  y += 10;
  doc.setFontSize(10);

  y = drawRow('Employee Name:', record.employeeName || 'N/A', y);
  y = drawRow('Card Code:', record.employeeCardCode || 'N/A', y);
  if (record.employeeCode) y = drawRow('Employee Code:', record.employeeCode, y);
  if (record.employeeDepartment) y = drawRow('Department:', record.employeeDepartment, y);
  y += 5;

  doc.setFillColor(240, 245, 255);
  doc.rect(margin, y - 4, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('REQUEST & APPROVAL', margin + 2, y + 1);
  y += 10;
  doc.setFontSize(10);

  y = drawRow('Approved Request Ref:', record.approvedRequestReference || 'N/A', y);
  y += 5;

  doc.setFillColor(240, 245, 255);
  doc.rect(margin, y - 4, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FINANCIAL DETAILS', margin + 2, y + 1);
  y += 10;
  doc.setFontSize(10);

  if (type === 'loan') {
    y = drawRow('Loan Type:', (record.loanType || '').replace(/^\w/, (c: string) => c.toUpperCase()), y);
    y = drawRow('Principal Amount:', formatCurrencyPdf(record.principalAmount), y);
    y = drawRow('Interest Rate:', `${record.interestRate || 0}%`, y);
    y = drawRow('EMI Amount:', formatCurrencyPdf(record.emiAmount), y);
    y = drawRow('Tenure:', `${record.tenureMonths} months`, y);
    y = drawRow('Disbursement Date:', record.disbursementDate || 'N/A', y);
    y = drawRow('Deduction Start:', record.startDeductionDate || 'N/A', y);
  } else {
    y = drawRow('Advance Amount:', formatCurrencyPdf(record.amount), y);
    y = drawRow('Recovery Type:', (record.recoveryType || '').replace('_', ' ').replace(/^\w/, (c: string) => c.toUpperCase()), y);
    if (record.recoveryType === 'installment') {
      y = drawRow('Recovery/Month:', formatCurrencyPdf(record.recoveryAmount || 0), y);
      y = drawRow('Recovery Months:', String(record.recoveryMonths || 'N/A'), y);
    }
    y = drawRow('Advance Date:', record.advanceDate || 'N/A', y);
    y = drawRow('Recovery Start:', record.startRecoveryDate || 'N/A', y);
  }

  if (record.remarks || record.reason) {
    y += 3;
    y = drawRow('Remarks:', record.remarks || record.reason || '', y);
  }
  y += 5;

  y = drawRow('Status:', (record.status || 'active').replace(/^\w/, (c: string) => c.toUpperCase()), y);
  y += 15;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);

  const sigY = y;
  const colW = (pageW - margin * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const x = margin + i * colW + 5;
    doc.line(x, sigY, x + colW - 10, sigY);
  }
  y += 5;
  doc.setFontSize(9);
  doc.text('Employee Signature', margin + 5, y);
  doc.text('Prepared By', margin + colW + 5, y);
  doc.text('Authorized Signatory', margin + colW * 2 + 5, y);

  y += 15;
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('This is a system-generated document. Please verify all details before processing.', pageW / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  const fileName = `Payment_Memo_${reference}.pdf`;

  if (action === 'view') {
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl as unknown as string, '_blank');
  } else if (action === 'download') {
    doc.save(fileName);
  } else if (action === 'print') {
    const blobUrl = doc.output('bloburl');
    const printWindow = window.open(blobUrl as unknown as string, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }
}

export default function LoansAdvancesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("loans");
  const [showLoanDialog, setShowLoanDialog] = useState(false);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [loanForm, setLoanForm] = useState({
    employeeId: '', loanType: 'personal', principalAmount: '', interestRate: '0',
    emiAmount: '', tenureMonths: '', disbursementDate: '', startDeductionDate: '', remarks: '',
    approvedRequestReference: '',
  });
  const [advanceForm, setAdvanceForm] = useState({
    employeeId: '', amount: '', recoveryType: 'lump_sum', recoveryAmount: '',
    recoveryMonths: '', advanceDate: '', startRecoveryDate: '', reason: '',
    approvedRequestReference: '',
  });
  const [lastCreatedLoan, setLastCreatedLoan] = useState<any>(null);
  const [lastCreatedAdvance, setLastCreatedAdvance] = useState<any>(null);

  const { data: users = [] } = useQuery<any[]>({ queryKey: ['/api/users/selection'] });
  const { data: loans = [], isLoading: loansLoading } = useQuery<any[]>({ queryKey: ['/api/loan-advance/loans'] });
  const { data: advances = [], isLoading: advancesLoading } = useQuery<any[]>({ queryKey: ['/api/loan-advance/advances'] });

  const createLoanMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/loan-advance/loans', data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/loans'] });
      setShowLoanDialog(false);
      const empUser = users.find((u: any) => String(u.id) === loanForm.employeeId);
      const empName = empUser ? (empUser.firstName && empUser.lastName ? `${empUser.firstName} ${empUser.lastName}` : empUser.username) : 'N/A';
      setLastCreatedLoan({ ...data, employeeName: empName, employeeCardCode: empUser?.cardCode || null, employeeDepartment: empUser?.department || null, employeeCode: empUser?.employeeCode || null });
      toast({ title: 'Loan created successfully' });
      resetLoanForm();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const createAdvanceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/loan-advance/advances', data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/advances'] });
      setShowAdvanceDialog(false);
      const empUser = users.find((u: any) => String(u.id) === advanceForm.employeeId);
      const empName = empUser ? (empUser.firstName && empUser.lastName ? `${empUser.firstName} ${empUser.lastName}` : empUser.username) : 'N/A';
      setLastCreatedAdvance({ ...data, employeeName: empName, employeeCardCode: empUser?.cardCode || null, employeeDepartment: empUser?.department || null, employeeCode: empUser?.employeeCode || null });
      toast({ title: 'Advance created successfully' });
      resetAdvanceForm();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateLoanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PATCH', `/api/loan-advance/loans/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/loans'] });
      toast({ title: 'Loan updated' });
    },
  });

  const updateAdvanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PATCH', `/api/loan-advance/advances/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/advances'] });
      toast({ title: 'Advance updated' });
    },
  });

  const transferLoanMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('POST', `/api/loan-advance/loans/${id}/transfer-sap`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/loans'] });
      toast({ title: 'Loan JE posted to SAP', description: `JE Number: ${data.sapJeNumber}` });
    },
    onError: (err: any) => toast({ title: 'SAP Transfer Failed', description: err.message, variant: 'destructive' }),
  });

  const transferAdvanceMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('POST', `/api/loan-advance/advances/${id}/transfer-sap`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/loan-advance/advances'] });
      toast({ title: 'Advance JE posted to SAP', description: `JE Number: ${data.sapJeNumber}` });
    },
    onError: (err: any) => toast({ title: 'SAP Transfer Failed', description: err.message, variant: 'destructive' }),
  });

  function getToday() {
    return new Date().toISOString().split('T')[0];
  }
  function getFirstOfNextMonth() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toISOString().split('T')[0];
  }
  function resetLoanForm() {
    setLoanForm({ employeeId: '', loanType: 'personal', principalAmount: '', interestRate: '0', emiAmount: '', tenureMonths: '', disbursementDate: getToday(), startDeductionDate: getFirstOfNextMonth(), remarks: '', approvedRequestReference: '' });
  }
  function resetAdvanceForm() {
    setAdvanceForm({ employeeId: '', amount: '', recoveryType: 'lump_sum', recoveryAmount: '', recoveryMonths: '', advanceDate: getToday(), startRecoveryDate: getFirstOfNextMonth(), reason: '', approvedRequestReference: '' });
  }

  const filteredLoans = employeeFilter === 'all' ? loans : loans.filter((l: any) => String(l.employeeId) === employeeFilter);
  const filteredAdvances = employeeFilter === 'all' ? advances : advances.filter((a: any) => String(a.employeeId) === employeeFilter);

  const totalLoanOutstanding = filteredLoans.filter((l: any) => l.status === 'active').reduce((s: number, l: any) => s + parseFloat(l.outstandingBalance || '0'), 0);
  const totalAdvanceOutstanding = filteredAdvances.filter((a: any) => a.status === 'active').reduce((s: number, a: any) => s + parseFloat(a.outstandingBalance || '0'), 0);
  const activeLoansCount = filteredLoans.filter((l: any) => l.status === 'active').length;
  const activeAdvancesCount = filteredAdvances.filter((a: any) => a.status === 'active').length;

  const roleOrder: Record<string, number> = { 'Superuser': 0, 'Manager': 1, 'General Manager': 2, 'Senior Manager': 3, 'Employee': 4 };
  const sortedUsers = [...users].sort((a: any, b: any) => {
    const ra = roleOrder[a.role] ?? 5;
    const rb = roleOrder[b.role] ?? 5;
    if (ra !== rb) return ra - rb;
    const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
    const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
    return nameA.localeCompare(nameB);
  });
  const groupedByRole = sortedUsers.reduce((acc: Record<string, any[]>, u: any) => {
    const role = u.role || 'Other';
    if (!acc[role]) acc[role] = [];
    acc[role].push(u);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Loans & Advances Management</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Landmark className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Active Loans</p>
                <p className="text-2xl font-bold">{activeLoansCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><IndianRupee className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Loan Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(totalLoanOutstanding)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Wallet className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Active Advances</p>
                <p className="text-2xl font-bold">{activeAdvancesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><IndianRupee className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Advance Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(totalAdvanceOutstanding)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="loans">Loans</TabsTrigger>
            <TabsTrigger value="advances">Advances</TabsTrigger>
          </TabsList>
          <div className="flex gap-2 items-center">
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Filter by Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {Object.entries(groupedByRole).map(([role, roleUsers]) => (
                  <SelectGroup key={role}>
                    <SelectLabel className="text-xs font-semibold text-blue-600">{role}</SelectLabel>
                    {roleUsers.map((u: any) => {
                      const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username;
                      const dept = u.department ? ` \u2022 ${u.department}` : '';
                      return (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {name}{dept}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {activeTab === 'loans' && (
              <Button onClick={() => { resetLoanForm(); setShowLoanDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> New Loan
              </Button>
            )}
            {activeTab === 'advances' && (
              <Button onClick={() => { resetAdvanceForm(); setShowAdvanceDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> New Advance
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="loans">
          <Card>
            <CardContent className="pt-6">
              {loansLoading ? <p>Loading...</p> : filteredLoans.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {employeeFilter !== 'all' ? 'No loans found for selected employee.' : 'No loans found. Create a new loan to get started.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>EMI</TableHead>
                      <TableHead>Repaid</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Installments</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SAP</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoans.map((loan: any) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-mono text-sm">{loan.loanReference}</TableCell>
                        <TableCell>{loan.employeeName}</TableCell>
                        <TableCell className="capitalize">{loan.loanType}</TableCell>
                        <TableCell>{formatCurrency(loan.principalAmount)}</TableCell>
                        <TableCell>{formatCurrency(loan.emiAmount)}</TableCell>
                        <TableCell>{formatCurrency(loan.totalRepaid)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(loan.outstandingBalance)}</TableCell>
                        <TableCell>{loan.installmentsPaid}/{loan.tenureMonths}</TableCell>
                        <TableCell>{statusBadge(loan.status)}</TableCell>
                        <TableCell>
                          {loan.sapPostingStatus === 'posted' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />JE #{loan.sapJeNumber}</Badge>
                                </TooltipTrigger>
                                <TooltipContent>Posted to SAP on {loan.sapPostedAt ? new Date(loan.sapPostedAt).toLocaleDateString() : 'N/A'}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : loan.sapPostingStatus === 'failed' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-red-100 text-red-700 gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{loan.sapErrorMessage || 'Unknown error'}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : loan.sapPostingStatus === 'pending' ? (
                            <Badge className="bg-blue-100 text-blue-700 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Pending</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500">Not Posted</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedLoan(loan)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-indigo-600 hover:text-indigo-800" onClick={() => generatePaymentMemoPdf('loan', loan, 'view')}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Print Memo</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {loan.sapPostingStatus !== 'posted' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-blue-600 hover:text-blue-800"
                                      disabled={transferLoanMutation.isPending}
                                      onClick={() => transferLoanMutation.mutate(loan.id)}
                                    >
                                      {transferLoanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Transfer to SAP</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {loan.status === 'active' && (
                              <Button size="sm" variant="ghost" onClick={() => updateLoanMutation.mutate({ id: loan.id, data: { status: 'paused' } })}>
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {loan.status === 'paused' && (
                              <Button size="sm" variant="ghost" onClick={() => updateLoanMutation.mutate({ id: loan.id, data: { status: 'active' } })}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advances">
          <Card>
            <CardContent className="pt-6">
              {advancesLoading ? <p>Loading...</p> : filteredAdvances.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {employeeFilter !== 'all' ? 'No advances found for selected employee.' : 'No advances found. Create a new advance to get started.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Recovery Type</TableHead>
                      <TableHead>Recovery/Month</TableHead>
                      <TableHead>Recovered</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SAP</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAdvances.map((adv: any) => (
                      <TableRow key={adv.id}>
                        <TableCell className="font-mono text-sm">{adv.advanceReference}</TableCell>
                        <TableCell>{adv.employeeName}</TableCell>
                        <TableCell>{formatCurrency(adv.amount)}</TableCell>
                        <TableCell className="capitalize">{adv.recoveryType?.replace('_', ' ')}</TableCell>
                        <TableCell>{adv.recoveryType === 'installment' ? formatCurrency(adv.recoveryAmount || 0) : 'Full'}</TableCell>
                        <TableCell>{formatCurrency(adv.totalRecovered)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(adv.outstandingBalance)}</TableCell>
                        <TableCell>{statusBadge(adv.status)}</TableCell>
                        <TableCell>
                          {adv.sapPostingStatus === 'posted' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />JE #{adv.sapJeNumber}</Badge>
                                </TooltipTrigger>
                                <TooltipContent>Posted to SAP on {adv.sapPostedAt ? new Date(adv.sapPostedAt).toLocaleDateString() : 'N/A'}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : adv.sapPostingStatus === 'failed' ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className="bg-red-100 text-red-700 gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{adv.sapErrorMessage || 'Unknown error'}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : adv.sapPostingStatus === 'pending' ? (
                            <Badge className="bg-blue-100 text-blue-700 gap-1"><Loader2 className="h-3 w-3 animate-spin" />Pending</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500">Not Posted</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedAdvance(adv)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-indigo-600 hover:text-indigo-800" onClick={() => generatePaymentMemoPdf('advance', adv, 'view')}>
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Print Memo</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {adv.sapPostingStatus !== 'posted' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-blue-600 hover:text-blue-800"
                                      disabled={transferAdvanceMutation.isPending}
                                      onClick={() => transferAdvanceMutation.mutate(adv.id)}
                                    >
                                      {transferAdvanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Transfer to SAP</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {adv.status === 'active' && (
                              <Button size="sm" variant="ghost" onClick={() => updateAdvanceMutation.mutate({ id: adv.id, data: { status: 'paused' } })}>
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {adv.status === 'paused' && (
                              <Button size="sm" variant="ghost" onClick={() => updateAdvanceMutation.mutate({ id: adv.id, data: { status: 'active' } })}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Loan Dialog */}
      <Dialog open={showLoanDialog} onOpenChange={setShowLoanDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Loan</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Approved Request Reference <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. HR/LN/2025/001 or email approval ref" value={loanForm.approvedRequestReference} onChange={(e) => setLoanForm({ ...loanForm, approvedRequestReference: e.target.value })} />
            </div>
            <div>
              <Label>Employee</Label>
              <Select value={loanForm.employeeId} onValueChange={(v) => setLoanForm({ ...loanForm, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedByRole).map(([role, roleUsers]) => (
                    <SelectGroup key={role}>
                      <SelectLabel className="text-xs font-semibold text-blue-600">{role}</SelectLabel>
                      {roleUsers.map((u: any) => {
                        const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username;
                        const dept = u.department ? ` • ${u.department}` : '';
                        return <SelectItem key={u.id} value={String(u.id)}>{name}{dept}</SelectItem>;
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loan Type</Label>
              <Select value={loanForm.loanType} onValueChange={(v) => setLoanForm({ ...loanForm, loanType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="housing">Housing</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Principal Amount</Label>
                <Input type="number" value={loanForm.principalAmount} onChange={(e) => {
                  const principal = e.target.value;
                  const updated = { ...loanForm, principalAmount: principal };
                  if (principal && updated.tenureMonths) {
                    const r = parseFloat(updated.interestRate || '0') / 100 / 12;
                    const n = parseInt(updated.tenureMonths);
                    const p = parseFloat(principal);
                    const emi = r > 0 ? (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : p / n;
                    updated.emiAmount = Math.round(emi).toString();
                  }
                  setLoanForm(updated);
                }} />
              </div>
              <div>
                <Label>Interest Rate (%)</Label>
                <Input type="number" value={loanForm.interestRate} onChange={(e) => {
                  const rate = e.target.value;
                  const updated = { ...loanForm, interestRate: rate };
                  if (updated.principalAmount && updated.tenureMonths) {
                    const r = parseFloat(rate || '0') / 100 / 12;
                    const n = parseInt(updated.tenureMonths);
                    const p = parseFloat(updated.principalAmount);
                    const emi = r > 0 ? (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : p / n;
                    updated.emiAmount = Math.round(emi).toString();
                  }
                  setLoanForm(updated);
                }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tenure (Months)</Label>
                <Input type="number" value={loanForm.tenureMonths} onChange={(e) => {
                  const tenure = e.target.value;
                  const updated = { ...loanForm, tenureMonths: tenure };
                  if (updated.principalAmount && tenure) {
                    const r = parseFloat(updated.interestRate || '0') / 100 / 12;
                    const n = parseInt(tenure);
                    const p = parseFloat(updated.principalAmount);
                    const emi = r > 0 ? (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : p / n;
                    updated.emiAmount = Math.round(emi).toString();
                  }
                  setLoanForm(updated);
                }} />
              </div>
              <div>
                <Label>EMI Amount (Auto-calculated)</Label>
                <Input type="number" value={loanForm.emiAmount} onChange={(e) => setLoanForm({ ...loanForm, emiAmount: e.target.value })} className="bg-muted" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Disbursement Date</Label>
                <Input type="date" value={loanForm.disbursementDate} onChange={(e) => setLoanForm({ ...loanForm, disbursementDate: e.target.value })} />
              </div>
              <div>
                <Label>Start Deduction Date</Label>
                <Input type="date" value={loanForm.startDeductionDate} onChange={(e) => setLoanForm({ ...loanForm, startDeductionDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea value={loanForm.remarks} onChange={(e) => setLoanForm({ ...loanForm, remarks: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLoanDialog(false)}>Cancel</Button>
            <Button
              disabled={!loanForm.approvedRequestReference.trim() || !loanForm.employeeId || !loanForm.principalAmount || !loanForm.emiAmount || !loanForm.tenureMonths || !loanForm.disbursementDate || !loanForm.startDeductionDate}
              onClick={() => createLoanMutation.mutate({
                employeeId: Number(loanForm.employeeId),
                loanType: loanForm.loanType,
                principalAmount: parseFloat(loanForm.principalAmount),
                interestRate: parseFloat(loanForm.interestRate || '0'),
                emiAmount: parseFloat(loanForm.emiAmount),
                tenureMonths: parseInt(loanForm.tenureMonths),
                disbursementDate: loanForm.disbursementDate,
                startDeductionDate: loanForm.startDeductionDate,
                remarks: loanForm.remarks,
                approvedRequestReference: loanForm.approvedRequestReference.trim(),
              })}
            >
              {createLoanMutation.isPending ? 'Creating...' : 'Create Loan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Advance Dialog */}
      <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Advance</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Approved Request Reference <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. HR/ADV/2025/001 or email approval ref" value={advanceForm.approvedRequestReference} onChange={(e) => setAdvanceForm({ ...advanceForm, approvedRequestReference: e.target.value })} />
            </div>
            <div>
              <Label>Employee</Label>
              <Select value={advanceForm.employeeId} onValueChange={(v) => setAdvanceForm({ ...advanceForm, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedByRole).map(([role, roleUsers]) => (
                    <SelectGroup key={role}>
                      <SelectLabel className="text-xs font-semibold text-blue-600">{role}</SelectLabel>
                      {roleUsers.map((u: any) => {
                        const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username;
                        const dept = u.department ? ` • ${u.department}` : '';
                        return <SelectItem key={u.id} value={String(u.id)}>{name}{dept}</SelectItem>;
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Advance Amount</Label>
                <Input type="number" value={advanceForm.amount} onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })} />
              </div>
              <div>
                <Label>Recovery Type</Label>
                <Select value={advanceForm.recoveryType} onValueChange={(v) => setAdvanceForm({ ...advanceForm, recoveryType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="installment">Installment</SelectItem>
                    <SelectItem value="lump_sum">Lump Sum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {advanceForm.recoveryType === 'installment' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Recovery Amount/Month</Label>
                  <Input type="number" value={advanceForm.recoveryAmount} onChange={(e) => setAdvanceForm({ ...advanceForm, recoveryAmount: e.target.value })} />
                </div>
                <div>
                  <Label>Recovery Months</Label>
                  <Input type="number" value={advanceForm.recoveryMonths} onChange={(e) => setAdvanceForm({ ...advanceForm, recoveryMonths: e.target.value })} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Advance Date</Label>
                <Input type="date" value={advanceForm.advanceDate} onChange={(e) => setAdvanceForm({ ...advanceForm, advanceDate: e.target.value })} />
              </div>
              <div>
                <Label>Start Recovery Date</Label>
                <Input type="date" value={advanceForm.startRecoveryDate} onChange={(e) => setAdvanceForm({ ...advanceForm, startRecoveryDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={advanceForm.reason} onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdvanceDialog(false)}>Cancel</Button>
            <Button
              disabled={!advanceForm.approvedRequestReference.trim() || !advanceForm.employeeId || !advanceForm.amount || !advanceForm.advanceDate || !advanceForm.startRecoveryDate}
              onClick={() => createAdvanceMutation.mutate({
                employeeId: Number(advanceForm.employeeId),
                amount: parseFloat(advanceForm.amount),
                recoveryType: advanceForm.recoveryType,
                recoveryAmount: advanceForm.recoveryAmount ? parseFloat(advanceForm.recoveryAmount) : null,
                recoveryMonths: advanceForm.recoveryMonths ? parseInt(advanceForm.recoveryMonths) : null,
                advanceDate: advanceForm.advanceDate,
                startRecoveryDate: advanceForm.startRecoveryDate,
                reason: advanceForm.reason,
                approvedRequestReference: advanceForm.approvedRequestReference.trim(),
              })}
            >
              {createAdvanceMutation.isPending ? 'Creating...' : 'Create Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastCreatedLoan && (
        <Dialog open={!!lastCreatedLoan} onOpenChange={() => setLastCreatedLoan(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Loan Created — {lastCreatedLoan.loanReference}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Payment memo is ready. Choose an action below:</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => { generatePaymentMemoPdf('loan', lastCreatedLoan, 'view'); }}>
                <Eye className="h-4 w-4 mr-2" /> View Memo
              </Button>
              <Button variant="outline" onClick={() => { generatePaymentMemoPdf('loan', lastCreatedLoan, 'download'); }}>
                <FileText className="h-4 w-4 mr-2" /> Download Memo
              </Button>
              <Button variant="outline" onClick={() => { generatePaymentMemoPdf('loan', lastCreatedLoan, 'print'); }}>
                <FileText className="h-4 w-4 mr-2" /> Print Memo
              </Button>
              <Button variant="ghost" onClick={() => setLastCreatedLoan(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {lastCreatedAdvance && (
        <Dialog open={!!lastCreatedAdvance} onOpenChange={() => setLastCreatedAdvance(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Advance Created — {lastCreatedAdvance.advanceReference}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Payment memo is ready. Choose an action below:</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => { generatePaymentMemoPdf('advance', lastCreatedAdvance, 'view'); }}>
                <Eye className="h-4 w-4 mr-2" /> View Memo
              </Button>
              <Button variant="outline" onClick={() => { generatePaymentMemoPdf('advance', lastCreatedAdvance, 'download'); }}>
                <FileText className="h-4 w-4 mr-2" /> Download Memo
              </Button>
              <Button variant="outline" onClick={() => { generatePaymentMemoPdf('advance', lastCreatedAdvance, 'print'); }}>
                <FileText className="h-4 w-4 mr-2" /> Print Memo
              </Button>
              <Button variant="ghost" onClick={() => setLastCreatedAdvance(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Loan Detail Dialog */}
      <LoanDetailDialog loan={selectedLoan} onClose={() => setSelectedLoan(null)} onStatusChange={(id: number, status: string) => updateLoanMutation.mutate({ id, data: { status } })} />

      {/* Advance Detail Dialog */}
      <AdvanceDetailDialog advance={selectedAdvance} onClose={() => setSelectedAdvance(null)} onStatusChange={(id: number, status: string) => updateAdvanceMutation.mutate({ id, data: { status } })} />
    </div>
  );
}

function LoanDetailDialog({ loan, onClose, onStatusChange }: { loan: any; onClose: () => void; onStatusChange: (id: number, status: string) => void }) {
  const { data: detail } = useQuery<any>({
    queryKey: ['/api/loan-advance/loans', loan?.id],
    enabled: !!loan?.id,
  });

  if (!loan) return null;
  const d = detail || loan;

  return (
    <Dialog open={!!loan} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Loan Details — {d.loanReference}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-sm text-muted-foreground">Employee</p><p className="font-medium">{d.employeeName}</p></div>
            <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium capitalize">{d.loanType}</p></div>
            <div><p className="text-sm text-muted-foreground">Principal</p><p className="font-medium">{formatCurrency(d.principalAmount)}</p></div>
            <div><p className="text-sm text-muted-foreground">EMI</p><p className="font-medium">{formatCurrency(d.emiAmount)}</p></div>
            <div><p className="text-sm text-muted-foreground">Interest Rate</p><p className="font-medium">{d.interestRate}%</p></div>
            <div><p className="text-sm text-muted-foreground">Tenure</p><p className="font-medium">{d.tenureMonths} months</p></div>
            <div><p className="text-sm text-muted-foreground">Disbursement Date</p><p className="font-medium">{d.disbursementDate}</p></div>
            <div><p className="text-sm text-muted-foreground">Start Deduction</p><p className="font-medium">{d.startDeductionDate}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Repaid</p><p className="font-medium text-green-600">{formatCurrency(d.totalRepaid)}</p></div>
            <div><p className="text-sm text-muted-foreground">Outstanding</p><p className="font-medium text-red-600">{formatCurrency(d.outstandingBalance)}</p></div>
            <div><p className="text-sm text-muted-foreground">Installments</p><p className="font-medium">{d.installmentsPaid}/{d.tenureMonths}</p></div>
            <div><p className="text-sm text-muted-foreground">Status</p>{statusBadge(d.status)}</div>
          </div>
          {d.remarks && <div><p className="text-sm text-muted-foreground">Remarks</p><p>{d.remarks}</p></div>}

          {d.repayments && d.repayments.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Repayment History</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Run #</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.repayments.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.installmentNumber}</TableCell>
                      <TableCell>{formatCurrency(r.amount)}</TableCell>
                      <TableCell>{r.repaymentDate}</TableCell>
                      <TableCell>{formatCurrency(r.balanceAfter)}</TableCell>
                      <TableCell>{r.runNumber}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          {d.status === 'active' && (
            <>
              <Button variant="outline" onClick={() => { onStatusChange(d.id, 'paused'); onClose(); }}>
                <Pause className="h-4 w-4 mr-2" /> Pause Loan
              </Button>
              <Button variant="destructive" onClick={() => { onStatusChange(d.id, 'written_off'); onClose(); }}>
                <XCircle className="h-4 w-4 mr-2" /> Write Off
              </Button>
            </>
          )}
          {d.status === 'paused' && (
            <Button onClick={() => { onStatusChange(d.id, 'active'); onClose(); }}>
              <Play className="h-4 w-4 mr-2" /> Resume Loan
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDetailDialog({ advance, onClose, onStatusChange }: { advance: any; onClose: () => void; onStatusChange: (id: number, status: string) => void }) {
  const { data: detail } = useQuery<any>({
    queryKey: ['/api/loan-advance/advances', advance?.id],
    enabled: !!advance?.id,
  });

  if (!advance) return null;
  const d = detail || advance;

  return (
    <Dialog open={!!advance} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Advance Details — {d.advanceReference}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-sm text-muted-foreground">Employee</p><p className="font-medium">{d.employeeName}</p></div>
            <div><p className="text-sm text-muted-foreground">Amount</p><p className="font-medium">{formatCurrency(d.amount)}</p></div>
            <div><p className="text-sm text-muted-foreground">Recovery Type</p><p className="font-medium capitalize">{d.recoveryType?.replace('_', ' ')}</p></div>
            {d.recoveryType === 'installment' && (
              <>
                <div><p className="text-sm text-muted-foreground">Recovery/Month</p><p className="font-medium">{formatCurrency(d.recoveryAmount || 0)}</p></div>
                <div><p className="text-sm text-muted-foreground">Recovery Months</p><p className="font-medium">{d.recoveryMonths}</p></div>
              </>
            )}
            <div><p className="text-sm text-muted-foreground">Advance Date</p><p className="font-medium">{d.advanceDate}</p></div>
            <div><p className="text-sm text-muted-foreground">Start Recovery</p><p className="font-medium">{d.startRecoveryDate}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Recovered</p><p className="font-medium text-green-600">{formatCurrency(d.totalRecovered)}</p></div>
            <div><p className="text-sm text-muted-foreground">Outstanding</p><p className="font-medium text-red-600">{formatCurrency(d.outstandingBalance)}</p></div>
            <div><p className="text-sm text-muted-foreground">Status</p>{statusBadge(d.status)}</div>
          </div>
          {d.reason && <div><p className="text-sm text-muted-foreground">Reason</p><p>{d.reason}</p></div>}

          {d.recoveries && d.recoveries.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Recovery History</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Run #</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.recoveries.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.installmentNumber}</TableCell>
                      <TableCell>{formatCurrency(r.amount)}</TableCell>
                      <TableCell>{r.recoveryDate}</TableCell>
                      <TableCell>{formatCurrency(r.balanceAfter)}</TableCell>
                      <TableCell>{r.runNumber}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          {d.status === 'active' && (
            <>
              <Button variant="outline" onClick={() => { onStatusChange(d.id, 'paused'); onClose(); }}>
                <Pause className="h-4 w-4 mr-2" /> Pause Recovery
              </Button>
              <Button variant="destructive" onClick={() => { onStatusChange(d.id, 'written_off'); onClose(); }}>
                <XCircle className="h-4 w-4 mr-2" /> Write Off
              </Button>
            </>
          )}
          {d.status === 'paused' && (
            <Button onClick={() => { onStatusChange(d.id, 'active'); onClose(); }}>
              <Play className="h-4 w-4 mr-2" /> Resume Recovery
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
