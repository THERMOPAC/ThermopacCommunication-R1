import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Play, CheckCircle2, AlertTriangle,
  RotateCcw, ArrowRight, Loader2,
  FileCheck, Users, Calculator, Award, Receipt, ShieldCheck, Send, XCircle, RefreshCw, Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface PayrollPeriod {
  id: number;
  periodName: string;
  startDate: string;
  endDate: string;
  payDate: string;
  status: string;
  currentRunNumber: number;
  finalizedRunNumber: number | null;
  isLocked: boolean;
  totalEmployees: number;
  totalGrossPay: string;
  totalDeductions: string;
  totalNetPay: string;
}

const STEP_CONFIG = [
  { key: 'attendance_snapshot', label: 'Attendance Snapshot', icon: Users, description: 'Freeze attendance data for the period' },
  { key: 'leave_consolidation', label: 'Leave Consolidation', icon: FileCheck, description: 'Apply paid/unpaid leave adjustments' },
  { key: 'salary_calculation', label: 'Salary Calculation', icon: Calculator, description: 'Calculate prorated salaries and allowances' },
  { key: 'bonus_calculation', label: 'Bonus Calculation', icon: Award, description: 'Apply KPI-based bonuses from DWAR' },
  { key: 'deduction_calculation', label: 'Deduction Calculation', icon: Receipt, description: 'Apply statutory and other deductions' },
  { key: 'tds_calculation', label: 'TDS / Income Tax', icon: Receipt, description: 'Compute monthly TDS based on projected annual tax' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  processing: 'bg-blue-100 text-blue-800',
  processed: 'bg-indigo-100 text-indigo-800',
  reviewed: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-emerald-100 text-emerald-800',
  locked: 'bg-red-100 text-red-800',
};

export function PayrollRunWizard({ period }: { period: PayrollPeriod }) {
  const { toast } = useToast();
  const [runNumber, setRunNumber] = useState(period.currentRunNumber || 0);
  const [currentStep, setCurrentStep] = useState(0);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [includeNonSystem, setIncludeNonSystem] = useState(true);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState('');

  const { data: runLog = [] } = useQuery<any[]>({
    queryKey: ['/api/payroll/run/log', period.id, runNumber],
    queryFn: async () => {
      return await apiRequest('GET', `/api/payroll/run/log/${period.id}?runNumber=${runNumber}`);
    },
    enabled: runNumber > 0,
  });

  const startRunMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/run/start', { periodId: period.id });
    },
    onSuccess: (data: any) => {
      setRunNumber(data.runNumber);
      setCurrentStep(0);
      toast({ title: 'Payroll run started', description: `Run #${data.runNumber} initiated` });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/run/log'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const executeStepMutation = useMutation({
    mutationFn: async (step: string) => {
      return await apiRequest('POST', '/api/payroll/run/step', {
        periodId: period.id,
        runNumber,
        step,
        includeNonSystem,
      });
    },
    onSuccess: (data: any, step) => {
      const stepLabel = STEP_CONFIG.find(s => s.key === step)?.label || step;
      toast({
        title: `${stepLabel} completed`,
        description: `${data.employeesProcessed} processed, ${data.errorCount} errors`,
      });
      setCurrentStep(prev => Math.min(prev + 1, STEP_CONFIG.length - 1));
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/run/log'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
    },
    onError: (err: any) => {
      toast({ title: 'Step failed', description: err.message, variant: 'destructive' });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest('POST', '/api/payroll/run/transition', {
        periodId: period.id,
        newStatus,
      });
    },
    onSuccess: () => {
      toast({ title: 'Status updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
    },
    onError: (err: any) => {
      toast({ title: 'Transition failed', description: err.message, variant: 'destructive' });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/run/reset', {
        periodId: period.id,
        reason: resetReason,
      });
    },
    onSuccess: (data: any) => {
      setRunNumber(data.newRunNumber);
      setCurrentStep(0);
      setShowResetDialog(false);
      setResetReason('');
      toast({ title: 'Run reset', description: `New run #${data.newRunNumber} ready` });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/run/log'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
    },
    onError: (err: any) => {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    },
  });

  const getStepStatus = (stepKey: string) => {
    const log = runLog.find((l: any) => l.step === stepKey && l.runNumber === runNumber);
    return log?.status || 'pending';
  };

  const getCompletedStepCount = () => {
    return STEP_CONFIG.filter(s => getStepStatus(s.key) === 'completed').length;
  };

  const runAllSteps = async () => {
    if (!runNumber) return;
    setIsRunningAll(true);
    try {
      for (let i = 0; i < STEP_CONFIG.length; i++) {
        const step = STEP_CONFIG[i];
        const status = getStepStatus(step.key);
        if (status === 'completed') continue;

        setRunAllProgress(`Running ${step.label}... (${i + 1}/${STEP_CONFIG.length})`);
        setCurrentStep(i);

        const result = await apiRequest('POST', '/api/payroll/run/step', {
          periodId: period.id,
          runNumber,
          step: step.key,
          includeNonSystem,
        });

        if (result.errorCount > 0 && !result.success) {
          toast({
            title: `${step.label} had errors`,
            description: `${result.employeesProcessed} processed, ${result.errorCount} errors. Pipeline paused.`,
            variant: 'destructive',
          });
          break;
        }

        toast({
          title: `${step.label} completed`,
          description: `${result.employeesProcessed} processed, ${result.errorCount} errors`,
        });
      }
      setRunAllProgress('');
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/run/log'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/verify'] });
    } catch (err: any) {
      toast({ title: 'Pipeline error', description: err.message, variant: 'destructive' });
    } finally {
      setIsRunningAll(false);
      setRunAllProgress('');
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Payroll Run Engine</h3>
          <Badge className={STATUS_COLORS[period.status || 'draft']}>
            {(period.status || 'draft').toUpperCase()}
          </Badge>
          {runNumber > 0 && (
            <Badge variant="outline">Run #{runNumber}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {(!runNumber || period.status === 'draft') && (
            <Button
              onClick={() => startRunMutation.mutate()}
              disabled={startRunMutation.isPending}
              size="sm"
            >
              {startRunMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              {runNumber > 0 ? 'New Run' : 'Start Run'}
            </Button>
          )}
          {runNumber > 0 && getCompletedStepCount() < STEP_CONFIG.length && period.status !== 'paid' && period.status !== 'locked' && (
            <Button
              onClick={runAllSteps}
              disabled={isRunningAll || executeStepMutation.isPending}
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
            >
              {isRunningAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {runAllProgress || 'Running...'}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Run All Steps
                </>
              )}
            </Button>
          )}
          {period.status !== 'paid' && period.status !== 'locked' && runNumber > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)} disabled={isRunningAll}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 mt-3">
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <input
              type="checkbox"
              id="include-non-system"
              checked={includeNonSystem}
              onChange={e => setIncludeNonSystem(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="include-non-system" className="text-sm text-blue-800 cursor-pointer">
              Include Non-System Users (calendar-based attendance)
            </Label>
          </div>

          <PipelineView
            steps={STEP_CONFIG}
            getStepStatus={getStepStatus}
            currentStep={currentStep}
            onExecuteStep={(step) => executeStepMutation.mutate(step)}
            isExecuting={executeStepMutation.isPending || isRunningAll}
            runNumber={runNumber}
            periodStatus={period.status || 'draft'}
            periodId={period.id}
          />

          {((getCompletedStepCount() === STEP_CONFIG.length && period.status === 'processed') || period.status === 'approved' || period.status === 'paid') && (
            <StatusTransitionBar
              currentStatus={period.status || 'draft'}
              onTransition={(s) => transitionMutation.mutate(s)}
              isPending={transitionMutation.isPending}
            />
          )}
      </div>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Payroll Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will unlock all locks for this period and start a fresh run. The previous run data will be preserved for audit.
            </p>
            <div>
              <Label>Reason for Reset</Label>
              <Textarea
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="Explain why this run needs to be reset..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={!resetReason.trim() || resetMutation.isPending}
            >
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Reset Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineView({
  steps,
  getStepStatus,
  currentStep,
  onExecuteStep,
  isExecuting,
  runNumber,
  periodStatus,
  periodId,
}: {
  steps: typeof STEP_CONFIG;
  getStepStatus: (key: string) => string;
  currentStep: number;
  onExecuteStep: (step: string) => void;
  isExecuting: boolean;
  runNumber: number;
  periodStatus: string;
  periodId: number;
}) {
  const allStepsCompleted = steps.every(s => getStepStatus(s.key) === 'completed');

  const { data: verificationSummary } = useQuery<any>({
    queryKey: ['/api/payroll/verify', periodId, 'summary'],
    queryFn: async () => {
      return await apiRequest('GET', `/api/payroll/verify/${periodId}/summary`);
    },
    enabled: allStepsCompleted && runNumber > 0,
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/payroll/verify/${periodId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/verify'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
    },
  });

  const getVerifyStatus = () => {
    if (!allStepsCompleted) return 'pending';
    if (!verificationSummary) return 'pending';
    if (verificationSummary.total === 0) return 'pending';
    if (verificationSummary.failed > 0) return 'failed';
    return 'completed';
  };

  const verifyStatus = getVerifyStatus();

  if (runNumber === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Play className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Click "Start Run" to begin the payroll processing pipeline.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const status = getStepStatus(step.key);
        const Icon = step.icon;
        const isActive = idx === currentStep && status !== 'completed';
        const canRun = runNumber > 0 && (idx === 0 || getStepStatus(steps[idx - 1].key) === 'completed') && status !== 'completed' && periodStatus !== 'paid' && periodStatus !== 'locked';

        return (
          <div
            key={step.key}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              status === 'completed' ? 'bg-green-50 border-green-200' :
              status === 'failed' ? 'bg-red-50 border-red-200' :
              status === 'running' ? 'bg-blue-50 border-blue-200' :
              isActive ? 'bg-blue-50/50 border-blue-100' :
              'bg-gray-50 border-gray-100'
            }`}
          >
            <div className={`p-2 rounded-full ${
              status === 'completed' ? 'bg-green-100 text-green-700' :
              status === 'failed' ? 'bg-red-100 text-red-700' :
              status === 'running' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> :
               status === 'failed' ? <XCircle className="h-5 w-5" /> :
               status === 'running' ? <Loader2 className="h-5 w-5 animate-spin" /> :
               <Icon className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{step.label}</div>
              <div className="text-xs text-muted-foreground">{step.description}</div>
            </div>
            {canRun && (
              <Button
                size="sm"
                variant={status === 'failed' ? 'destructive' : 'default'}
                onClick={() => onExecuteStep(step.key)}
                disabled={isExecuting}
              >
                {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-1">{status === 'failed' ? 'Retry' : 'Run'}</span>
              </Button>
            )}
            {status === 'completed' && (
              <Badge variant="outline" className="text-green-700 border-green-300">Done</Badge>
            )}
          </div>
        );
      })}

      <div
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          verifyStatus === 'completed' ? 'bg-green-50 border-green-200' :
          verifyStatus === 'failed' ? 'bg-amber-50 border-amber-200' :
          'bg-gray-50 border-gray-100'
        }`}
      >
        <div className={`p-2 rounded-full ${
          verifyStatus === 'completed' ? 'bg-green-100 text-green-700' :
          verifyStatus === 'failed' ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-gray-500'
        }`}>
          {verifyStatus === 'completed' ? <CheckCircle2 className="h-5 w-5" /> :
           verifyStatus === 'failed' ? <AlertTriangle className="h-5 w-5" /> :
           verifyMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> :
           <ShieldCheck className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Verify All Calculations</div>
          <div className="text-xs text-muted-foreground">
            {verifyStatus === 'completed' && verificationSummary
              ? `All ${verificationSummary.passed} records verified — no errors`
              : verifyStatus === 'failed' && verificationSummary
              ? `${verificationSummary.passed} passed, ${verificationSummary.failed} failed of ${verificationSummary.total} records`
              : 'Independently verify all salary calculations against source data'}
          </div>
        </div>
        {verifyMutation.isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        )}
        {verifyStatus === 'completed' && (
          <Badge variant="outline" className="text-green-700 border-green-300">Passed</Badge>
        )}
        {verifyStatus === 'failed' && (
          <Badge variant="outline" className="text-amber-700 border-amber-300">Issues Found</Badge>
        )}
      </div>

      <SapTransferStep
        periodId={periodId}
        periodStatus={periodStatus}
        verifyStatus={verifyStatus}
      />
    </div>
  );
}

function SapTransferStep({ periodId, periodStatus, verifyStatus }: { periodId: number; periodStatus: string; verifyStatus: string }) {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [showBatchResult, setShowBatchResult] = useState(false);

  const isReady = verifyStatus === 'completed';
  const isLocked = periodStatus === 'paid' || periodStatus === 'locked';

  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = useQuery<any>({
    queryKey: ['/api/payroll/sap-transfer', periodId, 'preview'],
    queryFn: async () => {
      return await apiRequest('GET', `/api/payroll/sap-transfer/${periodId}/preview`);
    },
    enabled: isReady && showPreview,
  });

  const batchTransferMutation = useMutation({
    mutationFn: async (recordIds: number[]) => {
      const results: any[] = [];
      for (const id of recordIds) {
        try {
          const r = await apiRequest('POST', `/api/admin/payroll/records/${id}/post-sap`);
          results.push({ recordId: id, success: true, ...r });
        } catch (e: any) {
          results.push({ recordId: id, success: false, error: e.message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const posted = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      setBatchResult(results);
      setShowBatchResult(true);
      toast({
        title: 'SAP Transfer Complete',
        description: `${posted} posted, ${failed} failed of ${results.length} records`,
        variant: failed > 0 ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/sap-transfer'] });
      refetchPreview();
    },
  });

  const getSapStatus = () => {
    if (!isReady) return 'pending';
    if (!preview) return 'pending';
    if (preview.eligible === 0 && preview.blocked === 0) return 'pending';
    if (preview.eligible === 0 && preview.totalRecords > 0) {
      const allPosted = preview.blockedRecords?.every((b: any) => b.blockReasons?.includes('Already posted'));
      if (allPosted) return 'completed';
      return 'blocked';
    }
    return 'ready';
  };

  const sapStatus = getSapStatus();

  return (
    <>
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          sapStatus === 'completed' ? 'bg-green-50 border-green-200' :
          sapStatus === 'blocked' ? 'bg-red-50 border-red-200' :
          sapStatus === 'ready' ? 'bg-orange-50 border-orange-200' :
          'bg-gray-50 border-gray-100'
        }`}
      >
        <div className={`p-2 rounded-full ${
          sapStatus === 'completed' ? 'bg-green-100 text-green-700' :
          sapStatus === 'blocked' ? 'bg-red-100 text-red-700' :
          sapStatus === 'ready' ? 'bg-orange-100 text-orange-700' :
          'bg-gray-100 text-gray-500'
        }`}>
          {sapStatus === 'completed' ? <CheckCircle2 className="h-5 w-5" /> :
           sapStatus === 'blocked' ? <XCircle className="h-5 w-5" /> :
           batchTransferMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> :
           <Send className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">SAP Transfer</div>
          <div className="text-xs text-muted-foreground">
            {sapStatus === 'completed'
              ? `All ${preview?.totalRecords || 0} records transferred to SAP`
              : sapStatus === 'ready' && preview
              ? `${preview.eligible} eligible, ${preview.blocked} blocked of ${preview.totalRecords} records`
              : sapStatus === 'blocked' && preview
              ? `All ${preview.totalRecords} records blocked — fix issues before transfer`
              : 'Post verified salary journal entries to SAP B1'}
          </div>
        </div>
        <div className="flex gap-2">
          {isReady && !isLocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowPreview(true); refetchPreview(); }}
              disabled={previewLoading}
            >
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              <span className="ml-1">Preview</span>
            </Button>
          )}
          {sapStatus === 'ready' && preview?.eligible > 0 && !isLocked && (
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                const ids = preview.eligibleRecords.map((r: any) => r.recordId);
                batchTransferMutation.mutate(ids);
              }}
              disabled={batchTransferMutation.isPending}
            >
              {batchTransferMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Posting...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Transfer All ({preview.eligible})</>
              )}
            </Button>
          )}
          {sapStatus === 'completed' && (
            <Badge variant="outline" className="text-green-700 border-green-300">All Posted</Badge>
          )}
        </div>
      </div>

      <Dialog open={showPreview && !!preview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>SAP Transfer Preview — {preview?.totalRecords || 0} Records</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-auto max-h-[65vh]">
            {preview?.eligible > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Eligible ({preview.eligible})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="text-left p-2">Employee</th>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">BP Code</th>
                        <th className="text-right p-2">Gross</th>
                        <th className="text-right p-2">Net Pay</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.eligibleRecords?.map((r: any) => (
                        <tr key={r.recordId} className="border-t">
                          <td className="p-2">{r.employeeName}</td>
                          <td className="p-2 text-xs text-muted-foreground">{r.employeeCode}</td>
                          <td className="p-2 text-xs font-mono">{r.cardCode}</td>
                          <td className="p-2 text-right">₹{parseFloat(r.grossPay || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right font-medium">₹{parseFloat(r.netPay || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-center"><Badge variant="outline" className="text-green-700 text-xs">Ready</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {preview?.blocked > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> Blocked ({preview.blocked})
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="text-left p-2">Employee</th>
                        <th className="text-left p-2">Code</th>
                        <th className="text-right p-2">Net Pay</th>
                        <th className="text-left p-2">Block Reasons</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.blockedRecords?.map((r: any) => (
                        <tr key={r.recordId} className="border-t">
                          <td className="p-2">{r.employeeName}</td>
                          <td className="p-2 text-xs text-muted-foreground">{r.employeeCode}</td>
                          <td className="p-2 text-right">₹{parseFloat(r.netPay || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {r.blockReasons?.map((reason: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-red-600 text-xs">{reason}</Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
            {preview?.eligible > 0 && (
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={() => {
                  setShowPreview(false);
                  const ids = preview.eligibleRecords.map((r: any) => r.recordId);
                  batchTransferMutation.mutate(ids);
                }}
                disabled={batchTransferMutation.isPending}
              >
                <Send className="h-4 w-4 mr-1" /> Transfer {preview.eligible} Records
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchResult} onOpenChange={setShowBatchResult}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>SAP Batch Transfer Results</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[65vh]">
            {batchResult && (
              <div className="space-y-2">
                <div className="flex gap-4 mb-3">
                  <Badge className="bg-green-600">{batchResult.filter((r: any) => r.success).length} Posted</Badge>
                  <Badge variant="destructive">{batchResult.filter((r: any) => !r.success).length} Failed</Badge>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2">Record</th>
                        <th className="text-center p-2">Status</th>
                        <th className="text-left p-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResult.map((r: any) => (
                        <tr key={r.recordId} className="border-t">
                          <td className="p-2">#{r.recordId}</td>
                          <td className="p-2 text-center">
                            {r.success
                              ? <Badge className="bg-green-600 text-xs">Posted</Badge>
                              : <Badge variant="destructive" className="text-xs">Failed</Badge>}
                          </td>
                          <td className="p-2 text-xs">
                            {r.success
                              ? `JE #${r.sapJeNumber || 'N/A'} (DocEntry: ${r.sapDocEntry || 'N/A'})`
                              : r.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchResult(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusTransitionBar({
  currentStatus,
  onTransition,
  isPending,
}: {
  currentStatus: string;
  onTransition: (status: string) => void;
  isPending: boolean;
}) {
  const transitions: Record<string, { next: string; label: string; variant: 'default' | 'outline' | 'destructive' }> = {
    processed: { next: 'approved', label: 'Approve Payroll', variant: 'default' },
    approved: { next: 'paid', label: 'Mark as Paid', variant: 'default' },
    paid: { next: 'locked', label: 'Lock Period', variant: 'destructive' },
  };

  const transition = transitions[currentStatus];
  if (!transition) return null;

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Next Step:</span>
        </div>
        <Button
          size="sm"
          variant={transition.variant}
          onClick={() => onTransition(transition.next)}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          {transition.label}
        </Button>
      </CardContent>
    </Card>
  );
}

