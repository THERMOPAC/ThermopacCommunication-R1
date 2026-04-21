/**
 * DrawingVerificationCard
 *
 * Shows the SolidWorks extraction job status for a drawing control.
 * Provides upload UI to submit a .slddrw file and create a pending extraction job.
 *
 * Data source: GET /api/epc-drawing-controls/:id/slddrw-jobs
 * Upload:      POST /api/epc-drawing-controls/:id/upload-slddrw
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck, ShieldX, ShieldAlert, Shield, RotateCcw, ChevronDown,
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Clock, Loader2,
  Server, Cpu, FileCheck2, Info, Upload, RefreshCw, Factory,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Job {
  id: number;
  status: string;
  slddrwFilename: string | null;
  nodeId: string | null;
  machineName: string | null;
  agentVersion: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  retryCount: number;
  ddsComparisonStatus: string | null;
  ddsComparisonResult: ParameterResult[] | null;
  extractionResult: any;
  createdAt: string;
}

interface ParameterResult {
  parameter: string;
  dds_value: string | null;
  dwg_value: string | null;
  status: 'match' | 'mismatch' | 'missing_dds' | 'missing_drawing' | 'low_confidence';
  severity: 'critical' | 'warning';
  note?: string;
}

// Roles allowed to approve or release (mirrors RELEASE_GATE_CONFIG)
const ALLOWED_ROLES = ['superuser', 'general manager', 'senior manager'];

interface Props {
  drawingControlId: number;
  userRole: string;
  drawingControlStatus: string;
  manufacturingReleaseRequired: boolean;
  releasedForManufacturing: boolean;
  releasedForManufacturingAt: string | null;
  onStatusChange?: () => void;
}

export function DrawingVerificationCard({
  drawingControlId,
  userRole,
  drawingControlStatus,
  manufacturingReleaseRequired,
  releasedForManufacturing,
  releasedForManufacturingAt,
  onStatusChange,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAllParams, setShowAllParams] = useState(false);
  const [warnAcknowledged, setWarnAcknowledged] = useState(false);

  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['/api/epc-drawing-controls', drawingControlId, 'slddrw-jobs'],
    queryFn: () =>
      apiRequest('GET', `/api/epc-drawing-controls/${drawingControlId}/slddrw-jobs`) as Promise<Job[]>,
    refetchInterval: (data: any) => {
      const rows: Job[] = Array.isArray(data) ? data : (data?.state?.data ?? []);
      const latest = rows[0];
      if (latest && ['pending', 'processing'].includes(latest.status)) return 10000;
      if (latest && latest.status === 'completed' && !latest.ddsComparisonStatus) return 5000;
      return false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: number) =>
      apiRequest('POST', `/api/epc-slddrw-jobs/${jobId}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/epc-drawing-controls', drawingControlId, 'slddrw-jobs'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ acknowledgeWarnings }: { acknowledgeWarnings: boolean }) =>
      apiRequest('POST', `/api/epc-drawing-controls/${drawingControlId}/approve`, {
        acknowledge_warnings: acknowledgeWarnings,
      }),
    onSuccess: () => {
      toast({ title: 'Drawing approved', description: 'Drawing control has been approved.' });
      qc.invalidateQueries({ queryKey: ['/api/epc-drawing-controls', drawingControlId, 'slddrw-jobs'] });
      onStatusChange?.();
    },
    onError: (err: any) => {
      toast({ title: 'Approval failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/epc-drawing-controls/${drawingControlId}/release/manufacturing`),
    onSuccess: () => {
      toast({ title: 'Released for Manufacturing', description: 'Drawing has been released for manufacturing.' });
      qc.invalidateQueries({ queryKey: ['/api/epc-drawing-controls', drawingControlId, 'slddrw-jobs'] });
      onStatusChange?.();
    },
    onError: (err: any) => {
      toast({ title: 'Release failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiRequest('POST', `/api/epc-drawing-controls/${drawingControlId}/upload-slddrw`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/epc-drawing-controls', drawingControlId, 'slddrw-jobs'] });
      toast({ title: 'Extraction job created', description: 'Waiting for Windows agent to pick up the job.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (err: any) => {
      toast({ title: 'Upload failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.slddrw')) {
      toast({ title: 'Invalid file', description: 'Only .slddrw files are accepted.', variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    uploadMutation.mutate(file);
  }

  const latest = jobs[0] ?? null;
  const _role = userRole.toLowerCase();
  const canApproveOrRelease = ALLOWED_ROLES.includes(_role);
  const isUploading = uploadMutation.isPending;

  if (isLoading) {
    return (
      <_CardShell status="idle">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      </_CardShell>
    );
  }

  if (!latest) {
    return (
      <_CardShell status="idle">
        <p className="text-[10px] text-muted-foreground italic mb-2">
          No extraction job yet. Upload a <span className="font-medium">.slddrw</span> file to trigger extraction.
        </p>
        <_UploadButton
          fileInputRef={fileInputRef}
          isUploading={isUploading}
          onChange={handleFileChange}
        />
      </_CardShell>
    );
  }

  return (
    <_CardShell status={latest.status} ddsStatus={latest.ddsComparisonStatus}>
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <_JobStatusBadge status={latest.status} />
          {latest.slddrwFilename && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
              {latest.slddrwFilename}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {latest.status === 'failed' && canApproveOrRelease && (
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[9px] px-1.5 gap-1"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate(latest.id)}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Retry
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[9px] px-1.5 gap-0.5"
            onClick={() => setShowDetails(s => !s)}
          >
            <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showDetails && "rotate-180")} />
            {showDetails ? 'Less' : 'Details'}
          </Button>
        </div>
      </div>

      {/* ── Pending / processing state ──────────────────────────────── */}
      {['pending', 'processing'].includes(latest.status) && (
        <div className="flex items-center gap-1.5 text-[10px] text-blue-600 mt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {latest.status === 'pending'
            ? 'Waiting for Windows agent to pick up job…'
            : `Processing on ${latest.machineName ?? latest.nodeId ?? 'agent'} — auto-refreshing`}
        </div>
      )}

      {/* ── Failed state ────────────────────────────────────────────── */}
      {latest.status === 'failed' && latest.failedReason && (
        <div className="mt-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          <span className="font-medium">Failure: </span>{latest.failedReason}
          {latest.retryCount > 0 && (
            <span className="text-[9px] text-muted-foreground ml-1">
              ({latest.retryCount} attempt{latest.retryCount > 1 ? 's' : ''})
            </span>
          )}
        </div>
      )}

      {/* ── DDS comparison (completed jobs) ─────────────────────────── */}
      {latest.status === 'completed' && !latest.ddsComparisonStatus && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Analysing drawing against DDS…
        </div>
      )}
      {latest.status === 'completed' && latest.ddsComparisonStatus && latest.ddsComparisonResult && (
        <_DdsComparisonBanner
          status={latest.ddsComparisonStatus}
          results={latest.ddsComparisonResult}
          showAll={showAllParams}
          onToggleAll={() => setShowAllParams(s => !s)}
        />
      )}

      {/* ── Approve gate (only when not yet approved) ────────────────── */}
      {latest.status === 'completed' &&
       latest.ddsComparisonStatus &&
       drawingControlStatus !== 'approved' &&
       drawingControlStatus !== 'released' &&
       canApproveOrRelease && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
          {latest.ddsComparisonStatus === 'warn' && (
            <label className="flex items-center gap-1.5 text-[10px] text-amber-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3 w-3 accent-amber-600"
                checked={warnAcknowledged}
                onChange={e => setWarnAcknowledged(e.target.checked)}
              />
              I have reviewed and acknowledge these warnings
            </label>
          )}
          <Button
            size="sm"
            className="h-6 text-[10px] px-2 w-full gap-1.5"
            variant={
              (latest.ddsComparisonStatus === 'pass' ||
               (latest.ddsComparisonStatus === 'warn' && warnAcknowledged))
                ? 'default'
                : 'outline'
            }
            disabled={
              approveMutation.isPending ||
              latest.ddsComparisonStatus === 'fail' ||
              latest.ddsComparisonStatus === 'blocked' ||
              (latest.ddsComparisonStatus === 'warn' && !warnAcknowledged)
            }
            onClick={() => approveMutation.mutate({ acknowledgeWarnings: warnAcknowledged })}
          >
            {approveMutation.isPending
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
              : <ShieldCheck className="h-2.5 w-2.5" />}
            {latest.ddsComparisonStatus === 'fail'
              ? 'Cannot Approve — Critical DDS Mismatch'
              : latest.ddsComparisonStatus === 'blocked'
              ? 'Cannot Approve — DDS Not Found'
              : 'Approve Drawing'}
          </Button>
        </div>
      )}

      {/* ── Manufacturing release gate ────────────────────────────────── */}
      {manufacturingReleaseRequired && canApproveOrRelease && (
        <div className="mt-2 pt-2 border-t border-border/40">
          {releasedForManufacturing ? (
            <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              <Factory className="h-3 w-3 shrink-0" />
              <span>
                Released for Manufacturing
                {releasedForManufacturingAt && (
                  <span className="text-[9px] text-muted-foreground ml-1">
                    · {formatDistanceToNow(new Date(releasedForManufacturingAt), { addSuffix: true })}
                  </span>
                )}
              </span>
            </div>
          ) : drawingControlStatus === 'approved' ? (
            <Button
              size="sm"
              className="h-6 text-[10px] px-2 w-full gap-1.5"
              variant="default"
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate()}
            >
              {releaseMutation.isPending
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Factory className="h-2.5 w-2.5" />}
              Release for Manufacturing
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-6 text-[10px] px-2 w-full gap-1.5"
              variant="outline"
              disabled
            >
              <Factory className="h-2.5 w-2.5" />
              Release for Manufacturing — Awaiting Approval
            </Button>
          )}
        </div>
      )}

      {/* ── Upload new (for failed / completed) ─────────────────────── */}
      {(latest.status === 'failed' || latest.status === 'completed') && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <_UploadButton
            fileInputRef={fileInputRef}
            isUploading={isUploading}
            onChange={handleFileChange}
            label="Upload New .slddrw"
            icon={<RefreshCw className="h-2.5 w-2.5" />}
          />
        </div>
      )}

      {/* ── Detail panel ────────────────────────────────────────────── */}
      {showDetails && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
          <_DetailRow icon={<Clock className="h-2.5 w-2.5" />} label="Created">
            {_relTime(latest.createdAt)}
          </_DetailRow>
          {latest.nodeId && (
            <_DetailRow icon={<Server className="h-2.5 w-2.5" />} label="Node">
              {latest.nodeId}{latest.machineName ? ` (${latest.machineName})` : ''}
            </_DetailRow>
          )}
          {latest.agentVersion && (
            <_DetailRow icon={<Cpu className="h-2.5 w-2.5" />} label="Agent">
              v{latest.agentVersion}
            </_DetailRow>
          )}
          {latest.completedAt && (
            <_DetailRow icon={<FileCheck2 className="h-2.5 w-2.5" />} label="Completed">
              {_relTime(latest.completedAt)}
            </_DetailRow>
          )}
          {latest.extractionResult && (
            <_ExtractionSummary result={latest.extractionResult} />
          )}
          {jobs.length > 1 && (
            <p className="text-[9px] text-muted-foreground mt-1">
              {jobs.length - 1} earlier job{jobs.length > 2 ? 's' : ''}
            </p>
          )}
        </div>
      )}
    </_CardShell>
  );
}

// ── Upload button ────────────────────────────────────────────────────────────

function _UploadButton({
  fileInputRef,
  isUploading,
  onChange,
  label = 'Upload .slddrw',
  icon,
}: {
  fileInputRef: React.RefObject<HTMLInputElement>;
  isUploading: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".slddrw"
        className="hidden"
        onChange={onChange}
        disabled={isUploading}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-2 gap-1.5 w-full"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : (icon ?? <Upload className="h-2.5 w-2.5" />)}
        {isUploading ? 'Uploading…' : label}
      </Button>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function _CardShell({
  status,
  ddsStatus,
  children,
}: {
  status: string;
  ddsStatus?: string | null;
  children: React.ReactNode;
}) {
  const border =
    ddsStatus === 'fail' || ddsStatus === 'blocked' ? 'border-red-300 bg-red-50/30' :
    ddsStatus === 'warn'  ? 'border-amber-300 bg-amber-50/20' :
    ddsStatus === 'pass'  ? 'border-green-300 bg-green-50/20' :
    status === 'failed'   ? 'border-red-200 bg-red-50/20' :
    'border-dashed border-blue-200 bg-blue-50/30';

  const icon =
    ddsStatus === 'fail' || ddsStatus === 'blocked' ? <ShieldX className="h-3.5 w-3.5 text-red-600" /> :
    ddsStatus === 'warn'  ? <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> :
    ddsStatus === 'pass'  ? <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> :
    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />;

  const titleColour =
    ddsStatus === 'fail' || ddsStatus === 'blocked' ? 'text-red-700' :
    ddsStatus === 'warn'  ? 'text-amber-700' :
    ddsStatus === 'pass'  ? 'text-green-700' :
    'text-blue-700';

  return (
    <div className={cn("rounded-lg border shadow-sm", border)}>
      <div className={cn("flex items-center gap-1.5 px-3 py-2 font-medium text-[11px]", titleColour)}>
        {icon}
        Drawing Verification
      </div>
      <div className="px-3 pb-3 space-y-1">
        {children}
      </div>
    </div>
  );
}

function _JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: string }> = {
    pending:    { label: 'Queued',     variant: 'bg-blue-100 text-blue-700 border-blue-200' },
    processing: { label: 'Extracting', variant: 'bg-violet-100 text-violet-700 border-violet-200' },
    completed:  { label: 'Extracted',  variant: 'bg-green-100 text-green-700 border-green-200' },
    failed:     { label: 'Failed',     variant: 'bg-red-100 text-red-700 border-red-200' },
  };
  const cfg = map[status] ?? { label: status, variant: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn("text-[9px] font-medium border rounded px-1.5 py-0.5", cfg.variant)}>
      {cfg.label}
    </span>
  );
}

function _DdsComparisonBanner({
  status, results, showAll, onToggleAll,
}: {
  status: string;
  results: ParameterResult[];
  showAll: boolean;
  onToggleAll: () => void;
}) {
  const cfg = {
    pass:    { bg: 'bg-green-50 border-green-200',  text: 'text-green-700', label: 'DDS Match — All critical parameters verified',   Icon: CheckCircle2 },
    warn:    { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700', label: 'DDS Warning — Minor discrepancies found',          Icon: AlertTriangle },
    fail:    { bg: 'bg-red-50 border-red-200',      text: 'text-red-700',   label: 'DDS FAIL — Critical mismatch blocks approval',     Icon: XCircle },
    blocked: { bg: 'bg-red-50 border-red-200',      text: 'text-red-700',   label: 'DDS BLOCKED — No DDS record found',               Icon: ShieldX },
  }[status] ?? {
    bg: 'bg-muted', text: 'text-muted-foreground', label: status, Icon: HelpCircle,
  };

  const criticalIssues = results.filter(r =>
    r.severity === 'critical' && ['mismatch', 'missing_drawing'].includes(r.status)
  );
  const warnIssues = results.filter(r =>
    r.severity === 'warning' && ['mismatch', 'missing_drawing', 'low_confidence'].includes(r.status)
  );
  const displayed = showAll ? results : results.slice(0, 6);

  return (
    <div className={cn("rounded border mt-1 p-2 space-y-1.5", cfg.bg)}>
      <div className={cn("flex items-center gap-1.5 text-[10px] font-medium", cfg.text)}>
        <cfg.Icon className="h-3 w-3" />
        {cfg.label}
        {(criticalIssues.length > 0 || warnIssues.length > 0) && (
          <span className="ml-auto text-[9px] font-normal">
            {criticalIssues.length > 0 && `${criticalIssues.length} critical`}
            {criticalIssues.length > 0 && warnIssues.length > 0 && ', '}
            {warnIssues.length > 0 && `${warnIssues.length} warning`}
          </span>
        )}
      </div>
      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-px">
            {displayed.map((r, i) => (
              <_ParamRow key={i} result={r} />
            ))}
          </div>
          {results.length > 6 && (
            <button
              onClick={onToggleAll}
              className={cn("text-[9px] underline underline-offset-2 mt-0.5", cfg.text)}
            >
              {showAll ? `Show less` : `Show all ${results.length} parameters`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function _ParamRow({ result }: { result: ParameterResult }) {
  const { status, severity, parameter, dds_value, dwg_value, note } = result;

  const icon =
    status === 'match'            ? <CheckCircle2 className="h-2.5 w-2.5 text-green-600 shrink-0" /> :
    status === 'mismatch'         ? <XCircle className="h-2.5 w-2.5 text-red-500 shrink-0" /> :
    status === 'missing_drawing'  ? <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" /> :
    status === 'missing_dds'      ? <Info className="h-2.5 w-2.5 text-muted-foreground shrink-0" /> :
    <HelpCircle className="h-2.5 w-2.5 text-muted-foreground shrink-0" />;

  if (status === 'match') {
    return (
      <div className="flex items-center gap-1 text-[9px] text-green-700 py-0.5">
        {icon}
        <span className="font-medium">{parameter}</span>
        <span className="text-muted-foreground ml-auto">{dds_value}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded px-1.5 py-1 text-[9px] space-y-0.5",
      severity === 'critical' ? 'bg-red-100/60' : 'bg-amber-100/60',
    )}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-medium">{parameter}</span>
        {severity === 'critical' && (
          <span className="ml-auto text-[8px] bg-red-200/80 text-red-700 px-1 rounded">CRITICAL</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1 pl-3.5">
        <div>
          <span className="text-muted-foreground">DDS: </span>
          <span className="font-medium">{dds_value ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Dwg: </span>
          <span className="font-medium">{dwg_value ?? '—'}</span>
        </div>
      </div>
      {note && <p className="text-[8px] text-muted-foreground pl-3.5 italic">{note}</p>}
    </div>
  );
}

function _ExtractionSummary({ result }: { result: any }) {
  if (!result) return null;
  const p = result.properties ?? {};
  const ddt = result.design_data_table ?? {};
  const sheets = result.sheets ?? [];
  const nozzles = result.nozzles ?? {};
  const errors = result.extraction_errors ?? {};
  const errorKeys = Object.keys(errors).filter(k => errors[k] != null);

  return (
    <div className="mt-1 space-y-0.5 pt-1 border-t border-border/30">
      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
        Extraction Summary
      </p>
      {p.drawing_number && (
        <_DetailRow icon={<FileCheck2 className="h-2.5 w-2.5" />} label="DWG No">
          {p.drawing_number} Rev {p.revision || '—'}
        </_DetailRow>
      )}
      <_DetailRow icon={<Shield className="h-2.5 w-2.5" />} label="Design Data">
        {ddt.source === 'notes'
          ? `Notes fallback (${ddt.fallback_text?.length ?? 0})`
          : ddt.found
            ? `${ddt.rows?.length ?? 0} rows`
            : ddt.status === 'missing'
              ? 'Missing'
              : 'Not found'}
      </_DetailRow>
      <_DetailRow icon={<Server className="h-2.5 w-2.5" />} label="Sheets">
        {sheets.length}
      </_DetailRow>
      {nozzles.found && (
        <_DetailRow icon={<Cpu className="h-2.5 w-2.5" />} label="Nozzles">
          {nozzles.nozzle_count}
        </_DetailRow>
      )}
      {errorKeys.length > 0 && (
        <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          Soft errors: {errorKeys.join(', ')}
        </div>
      )}
    </div>
  );
}

function _DetailRow({
  icon, label, children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {icon}
      <span className="font-medium text-foreground/70">{label}:</span>
      <span>{children}</span>
    </div>
  );
}

function _relTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}
