import { useState, useMemo } from "react";
import { fmtDate } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Settings, FileSearch, Shield, XCircle, ArrowUpDown, Download, Loader2, History, FileText } from "lucide-react";
import Layout from "@/components/layout";
import StatutoryCompliancePage from "./statutory-compliance-page";

const POSTING_STATUS_COLORS: Record<string, string> = {
  posted: 'bg-green-100 text-green-800',
  sap_missing: 'bg-yellow-100 text-yellow-800',
  posting_failed: 'bg-red-100 text-red-800',
};

const VERIFICATION_STATUS_COLORS: Record<string, string> = {
  not_verified: 'bg-gray-100 text-gray-600',
  matched: 'bg-green-100 text-green-800',
  within_tolerance: 'bg-amber-100 text-amber-800',
  mismatched: 'bg-red-100 text-red-800',
  verification_error: 'bg-orange-100 text-orange-800',
};

const PAN_STATUS_COLORS: Record<string, string> = {
  valid: 'bg-green-100 text-green-800',
  invalid: 'bg-red-100 text-red-800',
  unverified: 'bg-gray-100 text-gray-600',
  not_available: 'bg-yellow-100 text-yellow-800',
};

const SOURCE_COLORS: Record<string, string> = {
  payroll_192: 'bg-blue-100 text-blue-800',
  sap_wht_non_salary: 'bg-emerald-100 text-emerald-800',
};

const CHALLAN_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  included: 'bg-blue-100 text-blue-800',
  locked: 'bg-green-100 text-green-800',
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(val?.toString() || '0');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);
}

export default function TdsCompliancePage() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState('compliance');

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">TDS Compliance</h1>
            <p className="text-sm text-muted-foreground">Tax Deducted at Source — Section 192 (Salary) & Non-Salary WHT</p>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList>
            <TabsTrigger value="compliance">Challans & Filing</TabsTrigger>
            <TabsTrigger value="register">Compliance Register</TabsTrigger>
            <TabsTrigger value="reconciliation">SAP Reconciliation</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
          </TabsList>

          <TabsContent value="compliance" className="mt-4">
            <StatutoryCompliancePage moduleType="TDS" embedded />
          </TabsContent>

          <TabsContent value="register" className="mt-4">
            <ComplianceRegisterTab />
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-4">
            <ReconciliationTab />
          </TabsContent>

          <TabsContent value="exceptions" className="mt-4">
            <ExceptionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function ComplianceRegisterTab() {
  const { toast } = useToast();
  const currentFY = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return m >= 3 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`;
  }, []);

  const [filterFY, setFilterFY] = useState(currentFY);
  const [filterSection, setFilterSection] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterChallanStatus, setFilterChallanStatus] = useState('all');
  const [showSyncLog, setShowSyncLog] = useState(false);
  const [showNonSalaryChallanDialog, setShowNonSalaryChallanDialog] = useState(false);

  const now = new Date();
  const [syncMonth, setSyncMonth] = useState(String(now.getMonth() + 1));
  const [syncYear, setSyncYear] = useState(String(now.getFullYear()));

  const queryParams = new URLSearchParams({ financialYear: filterFY });
  if (filterSection !== 'all') queryParams.set('tdsSection', filterSection);
  if (filterSource !== 'all') queryParams.set('sourceCategory', filterSource);
  if (filterStage !== 'all') queryParams.set('deductionStage', filterStage);
  if (filterChallanStatus !== 'all') queryParams.set('challanStatus', filterChallanStatus);

  const { data: register = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/statutory/tds/compliance-register', filterFY, filterSection, filterSource, filterStage, filterChallanStatus],
    queryFn: () => fetch(`/api/statutory/tds/compliance-register?${queryParams}`).then(r => r.json()),
  });

  const { data: syncLogs = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/tds/sync-log', filterFY],
    queryFn: () => fetch(`/api/statutory/tds/sync-log?financialYear=${filterFY}`).then(r => r.json()),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/statutory/tds/sap-wht-sync', { month: parseInt(syncMonth), year: parseInt(syncYear) });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'SAP WHT Sync Complete',
        description: `Fetched ${data.summary?.fetched || 0} WHT lines — ${data.summary?.inserted || 0} inserted, ${data.summary?.updated || 0} updated, ${data.summary?.skipped || 0} skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/compliance-register'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/sync-log'] });
    },
    onError: (error: any) => {
      const msg = error?.message || 'SAP WHT sync failed';
      toast({
        title: 'Sync Failed',
        description: msg.replace(/^\d+:\s*/, '').replace(/^\{.*"error"\s*:\s*"([^"]+)".*\}$/, '$1'),
        variant: 'destructive',
      });
    },
  });

  const { data: nonSalaryPeriods = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/tds/non-salary-challan-periods', filterFY],
    queryFn: () => fetch(`/api/statutory/tds/non-salary-challan-periods?financialYear=${filterFY}`).then(r => r.json()),
    enabled: showNonSalaryChallanDialog,
  });

  const generateNonSalaryMutation = useMutation({
    mutationFn: async (data: { tdsSection: string; month: number; year: number }) => {
      return apiRequest('POST', '/api/statutory/tds/generate-non-salary-challan', data);
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Non-Salary Challan Generated',
        description: `Section ${data.summary?.section} — ${data.summary?.entryCount} entries, ${data.summary?.deducteeCount} deductees, TDS: ₹${parseFloat(data.summary?.totalTds || '0').toLocaleString('en-IN')}`,
      });
      setShowNonSalaryChallanDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/compliance-register'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/non-salary-challan-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/challans'] });
    },
    onError: (error: any) => {
      const msg = error?.message || 'Failed to generate challan';
      toast({
        title: 'Error',
        description: msg.replace(/^\d+:\s*/, '').replace(/^\{.*"error"\s*:\s*"([^"]+)".*\}$/, '$1'),
        variant: 'destructive',
      });
    },
  });

  const summary = useMemo(() => {
    const total = register.length;
    const totalTds = register.reduce((s: number, r: any) => s + parseFloat(r.tdsAmount || '0'), 0);
    const payroll = register.filter((r: any) => r.sourceCategory === 'payroll_192').length;
    const sapWht = register.filter((r: any) => r.sourceCategory === 'sap_wht_non_salary').length;
    const pending = register.filter((r: any) => r.challanStatus === 'pending').length;
    const invalidPan = register.filter((r: any) => r.panStatus === 'invalid' || r.panStatus === 'not_available').length;
    return { total, totalTds, payroll, sapWht, pending, invalidPan };
  }, [register]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-4">
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-base">SAP WHT Import</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowSyncLog(!showSyncLog)} className="text-xs">
              <History className="h-3 w-3 mr-1" /> {showSyncLog ? 'Hide' : 'Show'} Sync Log
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Import non-salary withholding tax data from SAP B1 Service Layer (Purchase Invoices, Vendor Payments, AP Credit Memos)</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={syncMonth} onValueChange={setSyncMonth}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthNames.map((name, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={syncYear} onValueChange={setSyncYear}>
              <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {syncMutation.isPending ? 'Syncing from SAP...' : 'Sync WHT from SAP'}
            </Button>
            {syncMutation.isPending && (
              <span className="text-xs text-muted-foreground">Querying PurchaseInvoices, VendorPayments, APCreditMemos...</span>
            )}
          </div>

          {showSyncLog && syncLogs.length > 0 && (
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Batch ID</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Fetched</TableHead>
                    <TableHead className="text-xs text-right">Inserted</TableHead>
                    <TableHead className="text-xs text-right">Updated</TableHead>
                    <TableHead className="text-xs text-right">Skipped</TableHead>
                    <TableHead className="text-xs">Synced At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.slice(0, 10).map((log: any) => (
                    <TableRow key={log.id} className="text-xs">
                      <TableCell className="font-mono text-xs">{log.syncBatchId}</TableCell>
                      <TableCell>{monthNames[(log.month || 1) - 1]} {log.year}</TableCell>
                      <TableCell>
                        <Badge className={log.syncStatus === 'completed' ? 'bg-green-100 text-green-800' : log.syncStatus === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}>
                          {log.syncStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{log.recordsFetched ?? 0}</TableCell>
                      <TableCell className="text-right">{log.recordsInserted ?? 0}</TableCell>
                      <TableCell className="text-right">{log.recordsUpdated ?? 0}</TableCell>
                      <TableCell className="text-right">{log.recordsSkipped ?? 0}</TableCell>
                      <TableCell>{log.syncedAt ? new Date(log.syncedAt).toLocaleString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-base">Non-Salary TDS Challan Generation</CardTitle>
            </div>
            <Button
              onClick={() => setShowNonSalaryChallanDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Non-Salary Challan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Generate TDS challans for SAP WHT entries (194C, 194J, 194I, 194Q) grouped by section and month</p>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total Entries</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{fmt(summary.totalTds)}</div>
            <div className="text-xs text-muted-foreground">Total TDS</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">{summary.payroll}</div>
            <div className="text-xs text-muted-foreground">Payroll (192)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{summary.sapWht}</div>
            <div className="text-xs text-muted-foreground">SAP WHT</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.pending}</div>
            <div className="text-xs text-muted-foreground">Pending Challan</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Unified TDS Register — FY {filterFY}</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterFY} onValueChange={setFilterFY}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    const fy = `${y}-${(y + 1).toString().slice(2)}`;
                    return <SelectItem key={fy} value={fy}>{fy}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Select value={filterSection} onValueChange={setFilterSection}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  <SelectItem value="192">192</SelectItem>
                  <SelectItem value="194C">194C</SelectItem>
                  <SelectItem value="194J">194J</SelectItem>
                  <SelectItem value="194H">194H</SelectItem>
                  <SelectItem value="194I">194I</SelectItem>
                  <SelectItem value="194Q">194Q</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="payroll_192">Payroll</SelectItem>
                  <SelectItem value="sap_wht_non_salary">SAP WHT</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-[110px]"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterChallanStatus} onValueChange={setFilterChallanStatus}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Challan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="included">Included</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading register...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Deductee</TableHead>
                    <TableHead>PAN</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Base Amt</TableHead>
                    <TableHead className="text-right">TDS</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Quarter</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>PAN Status</TableHead>
                    <TableHead>Challan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No entries found. Use the SAP WHT Import above to sync data, or generate payroll to populate the register.</TableCell></TableRow>
                  ) : register.map((r: any) => (
                    <TableRow key={r.id} className={parseFloat(r.tdsAmount || '0') < 0 ? 'bg-red-50' : ''}>
                      <TableCell className="font-mono font-medium">{r.tdsSection}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.deducteeName}</TableCell>
                      <TableCell className="font-mono text-xs">{r.deducteePan || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.deducteeType}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.baseAmount)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${parseFloat(r.tdsAmount || '0') < 0 ? 'text-red-600' : ''}`}>{fmt(r.tdsAmount)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.tdsRate ? `${r.tdsRate}%` : '—'}</TableCell>
                      <TableCell>{r.quarter}</TableCell>
                      <TableCell>{r.deductionStage ? <Badge variant="outline" className="text-xs">{r.deductionStage}</Badge> : '—'}</TableCell>
                      <TableCell><Badge className={SOURCE_COLORS[r.sourceCategory] || 'bg-gray-100'}>{r.sourceCategory === 'payroll_192' ? 'Payroll' : 'SAP WHT'}</Badge></TableCell>
                      <TableCell><Badge className={PAN_STATUS_COLORS[r.panStatus] || 'bg-gray-100'} >{r.panStatus}</Badge></TableCell>
                      <TableCell><Badge className={CHALLAN_STATUS_COLORS[r.challanStatus] || 'bg-gray-100'}>{r.challanStatus}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNonSalaryChallanDialog} onOpenChange={setShowNonSalaryChallanDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Generate Non-Salary TDS Challan</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Select a section and month to generate a TDS challan from SAP WHT data. Only pending entries with positive TDS amounts are included.
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {nonSalaryPeriods.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
                <p className="font-medium">No pending periods available</p>
                <p className="text-xs mt-1">All SAP WHT entries already have challans, or no data has been synced yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Section</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs">Qtr</TableHead>
                    <TableHead className="text-xs text-right">Entries</TableHead>
                    <TableHead className="text-xs text-right">Total TDS</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonSalaryPeriods.map((p: any, i: number) => {
                    const section = p.tds_section || p.tdsSection;
                    const mon = parseInt(p.month);
                    const yr = parseInt(p.year);
                    return (
                      <TableRow key={i} className={p.hasChallan ? 'opacity-50' : ''}>
                        <TableCell className="font-mono font-medium text-sm">{section}</TableCell>
                        <TableCell className="text-sm">{monthNames[mon - 1]} {yr}</TableCell>
                        <TableCell className="text-sm">{p.quarter}</TableCell>
                        <TableCell className="text-right text-sm">{p.entryCount}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-sm">{fmt(p.totalTds)}</TableCell>
                        <TableCell>
                          {p.hasChallan ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">Done</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!p.hasChallan && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => generateNonSalaryMutation.mutate({ tdsSection: section, month: mon, year: yr })}
                              disabled={generateNonSalaryMutation.isPending}
                            >
                              {generateNonSalaryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Generate'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNonSalaryChallanDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReconciliationTab() {
  const { toast } = useToast();
  const currentFY = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return m >= 3 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`;
  }, []);

  const [filterFY, setFilterFY] = useState(currentFY);
  const [filterQuarter, setFilterQuarter] = useState('all');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [showToleranceDialog, setShowToleranceDialog] = useState(false);
  const [toleranceInput, setToleranceInput] = useState('');

  const { data: periods = [] } = useQuery<any[]>({
    queryKey: ['/api/statutory/payroll-periods/finalized'],
  });

  const queryParams = new URLSearchParams({ financialYear: filterFY });
  if (filterQuarter !== 'all') queryParams.set('quarter', filterQuarter);

  const { data: reconData = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/statutory/tds/reconciliation', filterFY, filterQuarter],
    queryFn: () => fetch(`/api/statutory/tds/reconciliation?${queryParams}`).then(r => r.json()),
  });

  const { data: toleranceData } = useQuery<any>({
    queryKey: ['/api/statutory/tds/tolerance'],
    queryFn: () => fetch('/api/statutory/tds/tolerance').then(r => r.json()),
  });

  const refreshMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/statutory/tds/reconciliation/refresh', data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/reconciliation'] });
      toast({ title: 'Reconciliation refreshed', description: `${data.refreshed} records processed` });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const toleranceMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/statutory/tds/tolerance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/tolerance'] });
      setShowToleranceDialog(false);
      toast({ title: 'Tolerance updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const deepVerifyMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/statutory/tds/deep-je-verify', data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/statutory/tds/mismatch-exceptions'] });
      toast({
        title: 'Deep JE Verification Complete',
        description: `${data.verified} verified: ${data.matched} matched, ${data.withinTolerance} within tolerance, ${data.mismatched} mismatched, ${data.verificationErrors} errors`,
      });
    },
    onError: (e: any) => toast({ title: 'Verification Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const summary = useMemo(() => {
    const total = reconData.length;
    const posted = reconData.filter((r: any) => r.sapPostingStatus === 'posted').length;
    const missing = reconData.filter((r: any) => r.sapPostingStatus === 'sap_missing').length;
    const failed = reconData.filter((r: any) => r.sapPostingStatus === 'posting_failed').length;
    const totalTds = reconData.reduce((s: number, r: any) => s + parseFloat(r.payrollTdsAmount || '0'), 0);
    const verified = reconData.filter((r: any) => r.sapVerificationStatus !== 'not_verified').length;
    const jeMatched = reconData.filter((r: any) => r.sapVerificationStatus === 'matched').length;
    const jeWithinTol = reconData.filter((r: any) => r.sapVerificationStatus === 'within_tolerance').length;
    const jeMismatched = reconData.filter((r: any) => r.sapVerificationStatus === 'mismatched').length;
    return { total, posted, missing, failed, totalTds, verified, jeMatched, jeWithinTol, jeMismatched };
  }, [reconData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Section 192 — Payroll-SAP Reconciliation
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Phase 1: Posting status check. Phase 2: Deep JE amount verification against SAP journal entries.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => {
            setToleranceInput(toleranceData?.tolerance?.toString() || '1.00');
            setShowToleranceDialog(true);
          }}>
            <Settings className="h-4 w-4 mr-1" /> Tolerance: ₹{toleranceData?.tolerance || '1.00'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total Records</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{fmt(summary.totalTds)}</div>
            <div className="text-xs text-muted-foreground">Payroll TDS Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-2xl font-bold text-green-600">{summary.posted}</span></div>
            <div className="text-xs text-muted-foreground">SAP Posted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1"><Clock className="h-4 w-4 text-yellow-600" /><span className="text-2xl font-bold text-yellow-600">{summary.missing}</span></div>
            <div className="text-xs text-muted-foreground">SAP Missing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1"><XCircle className="h-4 w-4 text-red-600" /><span className="text-2xl font-bold text-red-600">{summary.failed}</span></div>
            <div className="text-xs text-muted-foreground">Posting Failed</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-base">Deep JE Amount Verification</CardTitle>
            </div>
            <Button
              onClick={() => {
                if (selectedPeriodId) {
                  deepVerifyMutation.mutate({ periodId: parseInt(selectedPeriodId) });
                } else {
                  deepVerifyMutation.mutate({ financialYear: filterFY });
                }
              }}
              disabled={deepVerifyMutation.isPending || summary.posted === 0}
              className="bg-purple-600 hover:bg-purple-700"
              size="sm"
            >
              {deepVerifyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSearch className="h-4 w-4 mr-2" />}
              {deepVerifyMutation.isPending ? 'Verifying JE Amounts...' : 'Verify JE Amounts'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Queries each SAP Journal Entry to verify the TDS amount matches payroll. 
            {summary.posted === 0 ? ' No posted records available — post payroll to SAP first.' : ` ${summary.posted} posted record(s) ready for verification.`}
            {selectedPeriodId ? ' Will verify selected period only.' : ` Will verify all posted records in FY ${filterFY}.`}
          </p>
        </CardHeader>
        {summary.verified > 0 && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 text-center border">
                <div className="text-lg font-bold text-purple-600">{summary.verified}</div>
                <div className="text-xs text-muted-foreground">Verified</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border">
                <div className="text-lg font-bold text-green-600">{summary.jeMatched}</div>
                <div className="text-xs text-muted-foreground">Matched</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border">
                <div className="text-lg font-bold text-amber-600">{summary.jeWithinTol}</div>
                <div className="text-xs text-muted-foreground">Within Tolerance</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border">
                <div className="text-lg font-bold text-red-600">{summary.jeMismatched}</div>
                <div className="text-xs text-muted-foreground">Mismatched</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Employee-Month Posting Status — FY {filterFY}</CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={filterFY} onValueChange={setFilterFY}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    const fy = `${y}-${(y + 1).toString().slice(2)}`;
                    return <SelectItem key={fy} value={fy}>{fy}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Select value={filterQuarter} onValueChange={setFilterQuarter}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Qtrs</SelectItem>
                  <SelectItem value="Q1">Q1</SelectItem>
                  <SelectItem value="Q2">Q2</SelectItem>
                  <SelectItem value="Q3">Q3</SelectItem>
                  <SelectItem value="Q4">Q4</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select period to refresh" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.periodName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => {
                  if (!selectedPeriodId) return toast({ title: 'Select a period first', variant: 'destructive' });
                  refreshMutation.mutate({ periodId: parseInt(selectedPeriodId) });
                }}
                disabled={refreshMutation.isPending || !selectedPeriodId}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshMutation.isPending ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading reconciliation data...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Quarter</TableHead>
                    <TableHead className="text-right">Payroll TDS</TableHead>
                    <TableHead>SAP Posting Status</TableHead>
                    <TableHead>JE Number</TableHead>
                    <TableHead>Posting Date</TableHead>
                    <TableHead className="text-right">SAP JE Amount</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Verification</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconData.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No reconciliation data. Select a payroll period and click Refresh.</TableCell></TableRow>
                  ) : reconData.map((r: any) => {
                    const variance = parseFloat(r.variance || '0');
                    return (
                      <TableRow key={r.id} className={r.sapVerificationStatus === 'mismatched' ? 'bg-red-50/50' : ''}>
                        <TableCell className="font-medium max-w-[180px] truncate">{r.employeeName}</TableCell>
                        <TableCell className="font-mono text-xs">{r.employeeCode || '—'}</TableCell>
                        <TableCell>{new Date(r.year, r.month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</TableCell>
                        <TableCell>{r.quarter}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(r.payrollTdsAmount)}</TableCell>
                        <TableCell><Badge className={POSTING_STATUS_COLORS[r.sapPostingStatus] || 'bg-gray-100'}>{r.sapPostingStatus === 'posted' ? 'Posted' : r.sapPostingStatus === 'sap_missing' ? 'SAP Missing' : 'Failed'}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.sapJeNumber || '—'}</TableCell>
                        <TableCell className="text-xs">{r.sapPostingDate ? fmtDate(r.sapPostingDate) : '—'}</TableCell>
                        <TableCell className="text-right font-mono">{r.sapVerifiedTdsAmount ? fmt(r.sapVerifiedTdsAmount) : '—'}</TableCell>
                        <TableCell className={`text-right font-mono ${variance !== 0 ? (Math.abs(variance) <= parseFloat(toleranceData?.tolerance || '1') ? 'text-amber-600' : 'text-red-600 font-semibold') : ''}`}>
                          {r.sapVerifiedTdsAmount ? fmt(r.variance) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={VERIFICATION_STATUS_COLORS[r.sapVerificationStatus] || 'bg-gray-100'}>
                            {r.sapVerificationStatus === 'not_verified' ? 'Not Verified' 
                             : r.sapVerificationStatus === 'matched' ? 'Matched'
                             : r.sapVerificationStatus === 'within_tolerance' ? 'Within Tol.'
                             : r.sapVerificationStatus === 'mismatched' ? 'Mismatched'
                             : r.sapVerificationStatus === 'verification_error' ? 'Error'
                             : r.sapVerificationStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showToleranceDialog} onOpenChange={setShowToleranceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reconciliation Tolerance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set the tolerance amount (INR) for variance matching. Variances within this threshold will be marked as "within tolerance" instead of "mismatched".</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">₹</span>
              <Input type="number" step="0.01" min="0" value={toleranceInput} onChange={e => setToleranceInput(e.target.value)} placeholder="1.00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToleranceDialog(false)}>Cancel</Button>
            <Button onClick={() => toleranceMutation.mutate({ tolerance: toleranceInput })} disabled={toleranceMutation.isPending}>
              {toleranceMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExceptionsTab() {
  const currentFY = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return m >= 3 ? `${y}-${(y + 1).toString().slice(2)}` : `${y - 1}-${y.toString().slice(2)}`;
  }, []);

  const [filterFY, setFilterFY] = useState(currentFY);
  const [filterQuarter, setFilterQuarter] = useState('all');

  const queryParams = new URLSearchParams({ financialYear: filterFY });
  if (filterQuarter !== 'all') queryParams.set('quarter', filterQuarter);

  const { data: exceptions = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/statutory/tds/mismatch-exceptions', filterFY, filterQuarter],
    queryFn: () => fetch(`/api/statutory/tds/mismatch-exceptions?${queryParams}`).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Mismatch Exceptions
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Entries where SAP posting is missing, failed, or amounts are mismatched after verification.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterFY} onValueChange={setFilterFY}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => {
                const y = new Date().getFullYear() - i;
                const fy = `${y}-${(y + 1).toString().slice(2)}`;
                return <SelectItem key={fy} value={fy}>{fy}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Select value={filterQuarter} onValueChange={setFilterQuarter}>
            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Qtrs</SelectItem>
              <SelectItem value="Q1">Q1</SelectItem>
              <SelectItem value="Q2">Q2</SelectItem>
              <SelectItem value="Q3">Q3</SelectItem>
              <SelectItem value="Q4">Q4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading exceptions...</div>
          ) : exceptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
              <p className="text-lg font-medium">No Exceptions</p>
              <p className="text-sm">All reconciled records are in order.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead className="text-right">Payroll TDS</TableHead>
                  <TableHead className="text-right">SAP JE Amt</TableHead>
                  <TableHead>SAP Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>JE Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((r: any) => (
                  <TableRow key={r.id} className="bg-red-50/50">
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.employeeCode || '—'}</TableCell>
                    <TableCell>{new Date(r.year, r.month - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</TableCell>
                    <TableCell>{r.quarter}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.payrollTdsAmount)}</TableCell>
                    <TableCell className="text-right font-mono">{r.sapVerifiedTdsAmount ? fmt(r.sapVerifiedTdsAmount) : '—'}</TableCell>
                    <TableCell><Badge className={POSTING_STATUS_COLORS[r.sapPostingStatus] || 'bg-gray-100'}>{r.sapPostingStatus === 'sap_missing' ? 'SAP Missing' : r.sapPostingStatus === 'posting_failed' ? 'Failed' : r.sapPostingStatus}</Badge></TableCell>
                    <TableCell>
                      <Badge className={VERIFICATION_STATUS_COLORS[r.sapVerificationStatus] || 'bg-gray-100'}>
                        {r.sapVerificationStatus === 'not_verified' ? 'Not Verified'
                         : r.sapVerificationStatus === 'matched' ? 'Matched'
                         : r.sapVerificationStatus === 'within_tolerance' ? 'Within Tol.'
                         : r.sapVerificationStatus === 'mismatched' ? 'Mismatched'
                         : r.sapVerificationStatus === 'verification_error' ? 'Error'
                         : r.sapVerificationStatus || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600 font-semibold">{r.variance ? fmt(r.variance) : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sapJeNumber || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
