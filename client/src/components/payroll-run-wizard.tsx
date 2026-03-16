import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Play, CheckCircle2, XCircle, Clock, AlertTriangle, Lock, Unlock,
  RotateCcw, ArrowRight, Shield, ShieldAlert, Eye, Loader2,
  FileCheck, Users, Calculator, Award, Receipt
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
  const [activeTab, setActiveTab] = useState('pipeline');

  const { data: runLog = [], refetch: refetchLog } = useQuery<any[]>({
    queryKey: ['/api/payroll/run/log', period.id, runNumber],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/payroll/run/log/${period.id}?runNumber=${runNumber}`);
      return res;
    },
    enabled: runNumber > 0,
  });

  const { data: exceptions = [], refetch: refetchExceptions } = useQuery<any[]>({
    queryKey: ['/api/payroll/run/exceptions', period.id, runNumber],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/payroll/run/exceptions/${period.id}?runNumber=${runNumber}`);
      return res;
    },
    enabled: runNumber > 0,
  });

  const { data: locks = [], refetch: refetchLocks } = useQuery<any[]>({
    queryKey: ['/api/payroll/locks', period.id],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/payroll/locks/${period.id}`);
      return res;
    },
  });

  const startRunMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/run/start', { periodId: period.id });
    },
    onSuccess: (data: any) => {
      setRunNumber(data.runNumber);
      setCurrentStep(0);
      toast({ title: 'Payroll run started', description: `Run #${data.runNumber} initiated` });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      refetchLog();
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
      });
    },
    onSuccess: (data: any, step) => {
      const stepLabel = STEP_CONFIG.find(s => s.key === step)?.label || step;
      toast({
        title: `${stepLabel} completed`,
        description: `${data.employeesProcessed} processed, ${data.errorCount} errors`,
      });
      setCurrentStep(prev => Math.min(prev + 1, STEP_CONFIG.length - 1));
      refetchLog();
      refetchExceptions();
      refetchLocks();
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-records'] });
    },
    onError: (err: any) => {
      toast({ title: 'Step failed', description: err.message, variant: 'destructive' });
      refetchLog();
      refetchExceptions();
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
      refetchLocks();
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
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/payroll-periods'] });
      refetchLog();
      refetchLocks();
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

  const unresolvedExceptions = exceptions.filter((e: any) => e.resolution === 'unresolved');
  const errorExceptions = unresolvedExceptions.filter((e: any) => e.severity === 'error' || e.severity === 'critical');
  const warningExceptions = unresolvedExceptions.filter((e: any) => e.severity === 'warning');

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
          {period.status !== 'paid' && period.status !== 'locked' && runNumber > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions {unresolvedExceptions.length > 0 && `(${unresolvedExceptions.length})`}
          </TabsTrigger>
          <TabsTrigger value="locks">Locks</TabsTrigger>
          <TabsTrigger value="log">Run Log</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-3 mt-3">
          <PipelineView
            steps={STEP_CONFIG}
            getStepStatus={getStepStatus}
            currentStep={currentStep}
            onExecuteStep={(step) => executeStepMutation.mutate(step)}
            isExecuting={executeStepMutation.isPending}
            runNumber={runNumber}
            periodStatus={period.status || 'draft'}
          />

          {getCompletedStepCount() === STEP_CONFIG.length && period.status === 'processed' && (
            <StatusTransitionBar
              currentStatus={period.status || 'draft'}
              onTransition={(s) => transitionMutation.mutate(s)}
              isPending={transitionMutation.isPending}
              hasErrors={errorExceptions.length > 0}
            />
          )}
          {(period.status === 'processed' || period.status === 'reviewed' || period.status === 'approved' || period.status === 'paid') && (
            <StatusTransitionBar
              currentStatus={period.status}
              onTransition={(s) => transitionMutation.mutate(s)}
              isPending={transitionMutation.isPending}
              hasErrors={errorExceptions.length > 0}
            />
          )}
        </TabsContent>

        <TabsContent value="exceptions" className="mt-3">
          <ExceptionsView exceptions={exceptions} periodId={period.id} />
        </TabsContent>

        <TabsContent value="locks" className="mt-3">
          <LocksPanel locks={locks} periodId={period.id} onRefresh={refetchLocks} />
        </TabsContent>

        <TabsContent value="log" className="mt-3">
          <RunLogView logs={runLog} />
        </TabsContent>
      </Tabs>

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
}: {
  steps: typeof STEP_CONFIG;
  getStepStatus: (key: string) => string;
  currentStep: number;
  onExecuteStep: (step: string) => void;
  isExecuting: boolean;
  runNumber: number;
  periodStatus: string;
}) {
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
    </div>
  );
}

function StatusTransitionBar({
  currentStatus,
  onTransition,
  isPending,
  hasErrors,
}: {
  currentStatus: string;
  onTransition: (status: string) => void;
  isPending: boolean;
  hasErrors: boolean;
}) {
  const transitions: Record<string, { next: string; label: string; variant: 'default' | 'outline' | 'destructive' }> = {
    processed: { next: 'reviewed', label: 'Mark as Reviewed', variant: 'default' },
    reviewed: { next: 'approved', label: 'Approve Payroll', variant: 'default' },
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
          {hasErrors && currentStatus === 'processed' && (
            <span className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Unresolved errors — review exceptions first
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={transition.variant}
          onClick={() => onTransition(transition.next)}
          disabled={isPending || (hasErrors && currentStatus === 'processed')}
        >
          {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          {transition.label}
        </Button>
      </CardContent>
    </Card>
  );
}

function ExceptionsView({ exceptions, periodId }: { exceptions: any[]; periodId: number }) {
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution, notes }: { id: number; resolution: string; notes?: string }) => {
      return await apiRequest('POST', `/api/payroll/run/exceptions/${id}/resolve`, { resolution, notes });
    },
    onSuccess: () => {
      toast({ title: 'Exception resolved' });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/run/exceptions', periodId] });
    },
  });

  if (exceptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No exceptions found for this run.</p>
        </CardContent>
      </Card>
    );
  }

  const severityIcon = (s: string) => {
    switch (s) {
      case 'error': case 'critical': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Eye className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-2">
      {exceptions.map((exc: any) => (
        <div key={exc.id} className={`p-3 rounded-lg border ${
          exc.resolution !== 'unresolved' ? 'bg-gray-50 border-gray-200 opacity-70' :
          exc.severity === 'error' || exc.severity === 'critical' ? 'bg-red-50 border-red-200' :
          exc.severity === 'warning' ? 'bg-yellow-50 border-yellow-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-start gap-2">
            {severityIcon(exc.severity)}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{exc.title}</div>
              {exc.details && <div className="text-xs text-muted-foreground mt-1">{exc.details}</div>}
              <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                <span>Step: {exc.step}</span>
                <span>Type: {exc.exceptionType}</span>
                {exc.resolution !== 'unresolved' && (
                  <Badge variant="outline" className="text-xs">{exc.resolution}</Badge>
                )}
              </div>
            </div>
            {exc.resolution === 'unresolved' && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveMutation.mutate({ id: exc.id, resolution: 'resolved' })}
                  disabled={resolveMutation.isPending}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolveMutation.mutate({ id: exc.id, resolution: 'ignored' })}
                  disabled={resolveMutation.isPending}
                >
                  Ignore
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LocksPanel({ locks, periodId, onRefresh }: { locks: any[]; periodId: number; onRefresh: () => void }) {
  const { toast } = useToast();
  const [showCreateLock, setShowCreateLock] = useState(false);
  const [lockType, setLockType] = useState('attendance');
  const [lockReason, setLockReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockId, setUnlockId] = useState<number | null>(null);

  const createLockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/locks', { periodId, lockType, lockReason });
    },
    onSuccess: () => {
      toast({ title: 'Lock created' });
      setShowCreateLock(false);
      setLockReason('');
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/payroll/locks/${unlockId}/unlock`, { reason: unlockReason });
    },
    onSuccess: () => {
      toast({ title: 'Lock removed' });
      setUnlockId(null);
      setUnlockReason('');
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const lockTypeLabels: Record<string, string> = {
    attendance: 'Attendance',
    leave: 'Leave',
    salary: 'Salary',
    payroll: 'Payroll',
    full: 'Full Period',
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">Period Locks</h4>
        <Button size="sm" variant="outline" onClick={() => setShowCreateLock(true)}>
          <Lock className="h-4 w-4 mr-1" /> Create Lock
        </Button>
      </div>

      {locks.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            <Unlock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No locks active for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locks.map((lock: any) => (
            <div key={lock.id} className={`p-3 rounded-lg border flex items-center gap-3 ${
              lock.isLocked ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
            }`}>
              {lock.isLocked ? (
                <Lock className="h-5 w-5 text-red-500" />
              ) : (
                <Unlock className="h-5 w-5 text-gray-400" />
              )}
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {lockTypeLabels[lock.lockType] || lock.lockType}
                  {!lock.isLocked && <span className="text-gray-400 ml-2">(Unlocked)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lock.lockReason || 'No reason specified'}
                  {' · '}
                  {new Date(lock.lockedAt).toLocaleDateString()}
                </div>
              </div>
              {lock.isLocked && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUnlockId(lock.id)}
                >
                  <Unlock className="h-4 w-4 mr-1" /> Unlock
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreateLock} onOpenChange={setShowCreateLock}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Lock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Lock Type</Label>
              <Select value={lockType} onValueChange={setLockType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="full">Full Period</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={lockReason} onChange={(e) => setLockReason(e.target.value)} placeholder="Reason for locking..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateLock(false)}>Cancel</Button>
            <Button onClick={() => createLockMutation.mutate()} disabled={createLockMutation.isPending}>
              {createLockMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Lock className="h-4 w-4 mr-1" />}
              Create Lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlockId !== null} onOpenChange={() => setUnlockId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Unlock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for removing this lock.</p>
            <Textarea value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Reason for unlocking..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => unlockMutation.mutate()}
              disabled={!unlockReason.trim() || unlockMutation.isPending}
            >
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunLogView({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No run logs yet.</p>
        </CardContent>
      </Card>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed': return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case 'running': return <Badge className="bg-blue-100 text-blue-800">Running</Badge>;
      case 'skipped': return <Badge className="bg-gray-100 text-gray-800">Skipped</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-2">
      {logs.map((log: any) => (
        <div key={log.id} className="p-3 rounded-lg border bg-white flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{log.step}</span>
              {statusBadge(log.status)}
              <span className="text-xs text-muted-foreground">Run #{log.runNumber}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {log.employeesProcessed != null && `${log.employeesProcessed} processed`}
              {log.errorCount > 0 && ` · ${log.errorCount} errors`}
              {log.completedAt && ` · ${new Date(log.completedAt).toLocaleString()}`}
            </div>
            {log.notes && <div className="text-xs text-red-600 mt-1">{log.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
