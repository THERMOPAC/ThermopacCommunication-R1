import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import Layout from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useReauthMutation } from '@/hooks/use-reauth';
import { DateInput } from '@/components/ui/date-input';
import { fmtDate, fmtDateTime } from '@/lib/date-utils';
import {
  Shield, ShieldCheck, ShieldOff, ShieldAlert,
  Save, Loader2, AlertTriangle, Clock, CalendarDays,
  Users, CheckCircle2, Lock, Unlock, Smartphone, MapPin,
  ClipboardList, Database, Eye, AlertCircle, ChevronDown,
  ChevronRight, Zap, RotateCcw, BadgeAlert,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AttendancePolicy {
  policyName: string;
  policyMode: string;
  applyToRoles: string[];
  requireGps: boolean;
  requireIpVerification: boolean;
}

interface SecurityScope {
  twoFa: {
    enabled: boolean;
    enforcementMode: 'optional' | 'required_from_date' | 'enforced';
    applyToRoles: string[];
    enforcementFromDate: string | null;
    updatedAt: string | null;
  };
  trustedDevice: {
    enabled: boolean;
    totalDevices: number;
    activeDevices: number;
  };
  appAccessGpsIp: {
    enabled: boolean;
    workLocationsTotal: number;
    workLocationsWithCoords: number;
    gpsWarning: boolean;
  };
  attendanceGpsIp: {
    enabled: boolean;
    workLocationsTotal: number;
    workLocationsWithCoords: number;
    gpsWarning: boolean;
    policies: AttendancePolicy[];
  };
  attendancePayrollReauth: { enabled: boolean };
  auditLogging: {
    loginAuditEnabled: boolean;
    attendanceAuditEnabled: boolean;
    archivalEnabled: boolean;
    monitoringEnabled: boolean;
  };
  payrollImpactReview: { enabled: boolean };
}

const ALL_ROLES = [
  'Superuser', 'General Manager', 'Senior Manager',
  'Senior Executive', 'Manager', 'Employee',
];

// ── Layer Card wrapper ────────────────────────────────────────────────────────

function LayerCard({
  num,
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  badgeLabel,
  badgeVariant = 'default',
  warning,
  children,
}: {
  num: number;
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  badgeLabel?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  warning?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={`transition-all ${enabled ? 'border-blue-200 dark:border-blue-800' : ''}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-4">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold
            ${enabled ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {num}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className={`h-4 w-4 shrink-0 ${enabled ? 'text-blue-600' : 'text-muted-foreground'}`} />
                <span className="text-sm font-semibold">{title}</span>
                {badgeLabel && (
                  <Badge variant={badgeVariant} className="text-[10px] h-4 px-1.5 font-normal">
                    {badgeLabel}
                  </Badge>
                )}
                {enabled && (
                  <Badge className="bg-blue-600 text-white text-[10px] h-4 px-1.5">Active</Badge>
                )}
              </div>
              <Switch checked={enabled} onCheckedChange={onToggle} className="shrink-0 mt-0.5" />
            </div>
            <p className="text-xs text-muted-foreground mt-1 pr-10">{description}</p>
            {warning && (
              <div className="mt-2 flex items-start gap-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">{warning}</p>
              </div>
            )}
            {enabled && children && (
              <div className="mt-4 pt-4 border-t space-y-4">
                {children}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SecurityEnforcementPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: scope, isLoading } = useQuery<SecurityScope>({
    queryKey: ['/api/admin/security-enforcement-scope'],
  });

  // ── Local state ───────────────────────────────────────────────────────────
  // Global — Role Scope (applies to all layers)
  const [scopeRoles, setScopeRoles]                   = useState<string[]>([]);
  // Layer 1 — 2FA
  const [twoFaEnabled, setTwoFaEnabled]               = useState(false);
  const [twoFaMode, setTwoFaMode]                     = useState<'enforced' | 'required_from_date'>('enforced');
  const [twoFaFromDate, setTwoFaFromDate]             = useState('');
  // Layer 2 — Trusted Device
  const [trustedDeviceEnabled, setTrustedDeviceEnabled] = useState(false);
  // Layer 3 — App Access GPS/IP
  const [appAccessEnabled, setAppAccessEnabled]       = useState(false);
  // Layer 4 — Attendance GPS/IP
  const [attendanceGpsEnabled, setAttendanceGpsEnabled] = useState(false);
  // Layer 5 — Attendance & Payroll Re-Auth
  const [reauthEnabled, setReauthEnabled]             = useState(false);
  // Layer 6 — Audit Logging
  const [loginAuditEnabled, setLoginAuditEnabled]     = useState(true);
  const [attendAuditEnabled, setAttendAuditEnabled]   = useState(true);
  const [archivalEnabled, setArchivalEnabled]         = useState(false);
  const [monitoringEnabled, setMonitoringEnabled]     = useState(false);
  // Layer 7 — Payroll Impact Review
  const [payrollReviewEnabled, setPayrollReviewEnabled] = useState(false);

  const [initialised, setInitialised]   = useState(false);
  const [savedAt, setSavedAt]           = useState<string | null>(null);
  const [showSummary, setShowSummary]   = useState(false);

  useEffect(() => {
    if (scope && !initialised) {
      const { twoFa, trustedDevice, appAccessGpsIp, attendanceGpsIp,
              attendancePayrollReauth, auditLogging, payrollImpactReview } = scope;
      setScopeRoles(twoFa.applyToRoles ?? []);
      setTwoFaEnabled(twoFa.enabled);
      setTwoFaMode(twoFa.enforcementMode === 'optional' ? 'enforced' : twoFa.enforcementMode);
      setTwoFaFromDate(twoFa.enforcementFromDate ?? '');
      setTrustedDeviceEnabled(trustedDevice.enabled);
      setAppAccessEnabled(appAccessGpsIp.enabled);
      setAttendanceGpsEnabled(attendanceGpsIp.enabled);
      setReauthEnabled(attendancePayrollReauth.enabled);
      setLoginAuditEnabled(auditLogging.loginAuditEnabled);
      setAttendAuditEnabled(auditLogging.attendanceAuditEnabled);
      setArchivalEnabled(auditLogging.archivalEnabled);
      setMonitoringEnabled(auditLogging.monitoringEnabled);
      setPayrollReviewEnabled(payrollImpactReview.enabled);
      setInitialised(true);
    }
  }, [scope, initialised]);

  // ── Active layers count (must come before validation) ────────────────────
  const auditMasterOn = loginAuditEnabled || attendAuditEnabled || archivalEnabled || monitoringEnabled;

  // ── Validation ────────────────────────────────────────────────────────────
  const anyLayerActive = twoFaEnabled || trustedDeviceEnabled || appAccessEnabled ||
    attendanceGpsEnabled || reauthEnabled || auditMasterOn || payrollReviewEnabled;
  const dateRequired = twoFaEnabled && twoFaMode === 'required_from_date' && !twoFaFromDate;
  const noRolesWhenRequired = anyLayerActive && scopeRoles.length === 0;
  const canSave = !dateRequired && !noRolesWhenRequired;

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useReauthMutation<{ success: boolean; updatedAt: string }, void>({
    mutationFn: async () => {
      const body = {
        twoFa: {
          enabled:            twoFaEnabled,
          enforcementMode:    twoFaMode,
          applyToRoles:       scopeRoles,
          enforcementFromDate: twoFaFromDate || null,
          gracePeriodEnabled: false,
          gracePeriodDays:    0,
        },
        trustedDevice:          { enabled: trustedDeviceEnabled },
        appAccessGpsIp:         { enabled: appAccessEnabled },
        attendanceGpsIp:        { enabled: attendanceGpsEnabled },
        attendancePayrollReauth: { enabled: reauthEnabled },
        auditLogging: {
          loginAuditEnabled:      loginAuditEnabled,
          attendanceAuditEnabled: attendAuditEnabled,
          archivalEnabled,
          monitoringEnabled,
        },
        payrollImpactReview: { enabled: payrollReviewEnabled },
      };

      const res = await fetch('/api/admin/security-enforcement-scope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === 'REAUTH_REQUIRED') throw data;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['/api/admin/security-enforcement-scope'] });
      setInitialised(false);
      setSavedAt(data.updatedAt);
      toast({ title: 'Security policy saved', description: 'All enforcement layers updated.' });
    },
    onError: (err: any) => {
      if (err?.code === 'REAUTH_REQUIRED') return;
      toast({ title: 'Save failed', description: err?.message ?? 'Could not update policy.', variant: 'destructive' });
    },
  });

  const toggleRole = (role: string) =>
    setScopeRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  // ── Active layers count ───────────────────────────────────────────────────
  const activeLayers = [
    twoFaEnabled, trustedDeviceEnabled, appAccessEnabled, attendanceGpsEnabled,
    reauthEnabled, auditMasterOn, payrollReviewEnabled,
  ].filter(Boolean).length;

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const gpsWarning = scope?.appAccessGpsIp.gpsWarning
    ? `${scope.appAccessGpsIp.workLocationsTotal} active work location(s) have no GPS coordinates — enforcement will pass-through until coordinates are added.`
    : undefined;

  return (
    <Layout>
      <Helmet><title>Security Enforcement Scope — THERMOPAC ERP</title></Helmet>

      <div className="p-6 max-w-2xl mx-auto space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg shrink-0">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Security Enforcement Scope</h1>
              <p className="text-sm text-muted-foreground">
                Independent controls for each security layer — {activeLayers} of 7 active
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={activeLayers > 0
              ? 'border-blue-300 text-blue-700 dark:text-blue-400'
              : 'border-muted-foreground/40 text-muted-foreground'}
          >
            {activeLayers} / 7 Active
          </Badge>
        </div>

        {/* ── REAUTH notice ─────────────────────────────────────────────── */}
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/40 py-3">
          <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0" />
          <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
            Every change to this page requires TOTP verification — your authenticator code will be requested on Save.
            Every change is permanently audit logged.
          </AlertDescription>
        </Alert>

        {/* ══ ROLE SCOPE ══════════════════════════════════════════════════════ */}
        <Card className={noRolesWhenRequired ? 'border-destructive' : ''}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-blue-100 dark:bg-blue-900">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-semibold">Role Scope</p>
                    <p className="text-xs text-muted-foreground">
                      Applies to all active enforcement layers — {scopeRoles.length === 0
                        ? 'no roles selected'
                        : `${scopeRoles.length} of ${ALL_ROLES.length} roles`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setScopeRoles([...ALL_ROLES])}>All</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setScopeRoles([])}>None</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-3">
                  {ALL_ROLES.map(role => {
                    const checked = scopeRoles.includes(role);
                    return (
                      <label key={role} htmlFor={`scope-role-${role}`}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm
                          ${checked ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'bg-muted/20 hover:bg-muted/40'}`}>
                        <Checkbox id={`scope-role-${role}`} checked={checked} onCheckedChange={() => toggleRole(role)} />
                        <span className="leading-none">{role}</span>
                      </label>
                    );
                  })}
                </div>
                {noRolesWhenRequired && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> At least one role must be selected when any layer is active
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══ LAYER 1 — 2-Step Verification ══════════════════════════════════ */}
        <LayerCard
          num={1}
          icon={ShieldCheck}
          title="2-Step Verification (2FA)"
          description="Controls login and account security. Scoped users must complete 2FA setup before accessing the ERP."
          enabled={twoFaEnabled}
          onToggle={setTwoFaEnabled}
          badgeLabel="Plane A — App Security"
          badgeVariant="secondary"
        >
          {/* Enforcement mode */}
          <RadioGroup
            value={twoFaMode}
            onValueChange={(v) => setTwoFaMode(v as 'enforced' | 'required_from_date')}
            className="space-y-2"
          >
            <label htmlFor="twofa-immediate"
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-green-400 has-[:checked]:bg-green-50 dark:has-[:checked]:bg-green-950/30">
              <RadioGroupItem value="enforced" id="twofa-immediate" className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Required Immediately</p>
                <p className="text-xs text-muted-foreground">Scoped users must complete 2FA on their next login.</p>
              </div>
            </label>
            <label htmlFor="twofa-date"
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-950/30">
              <RadioGroupItem value="required_from_date" id="twofa-date" className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Required From Date</p>
                <p className="text-xs text-muted-foreground mb-2">Enforcement begins on a scheduled date.</p>
                {twoFaMode === 'required_from_date' && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                    <DateInput
                      value={twoFaFromDate}
                      onChange={setTwoFaFromDate}
                      className={`h-8 text-sm w-36 ${dateRequired ? 'border-destructive' : ''}`}
                    />
                    {dateRequired && <span className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Required</span>}
                  </div>
                )}
              </div>
            </label>
          </RadioGroup>

        </LayerCard>

        {/* ══ LAYER 2 — Trusted Device Enforcement ═══════════════════════════ */}
        <LayerCard
          num={2}
          icon={Smartphone}
          title="Trusted Device Enforcement"
          description="Restrict ERP access to devices in the approved trusted device registry. Unrecognised devices are challenged or blocked."
          enabled={trustedDeviceEnabled}
          onToggle={setTrustedDeviceEnabled}
          badgeLabel="Plane A — App Security"
          badgeVariant="secondary"
        >
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-2xl font-bold text-blue-600">{scope?.trustedDevice.activeDevices ?? 0}</p>
              <p className="text-muted-foreground mt-0.5">Active trusted devices</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-2xl font-bold">{scope?.trustedDevice.totalDevices ?? 0}</p>
              <p className="text-muted-foreground mt-0.5">Total registered</p>
            </div>
          </div>
          <Alert className="py-2.5 border-blue-100 bg-blue-50/50 dark:bg-blue-950/20">
            <Lock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <AlertDescription className="text-xs text-blue-800 dark:text-blue-300">
              Recovery path: Admin can grant device trust via the Device Management page (requires TOTP).
              Superuser role is always exempt from device trust blocking.
            </AlertDescription>
          </Alert>
        </LayerCard>

        {/* ══ LAYER 3 — Application Access GPS/IP Enforcement ════════════════ */}
        <LayerCard
          num={3}
          icon={MapPin}
          title="Application Access GPS/IP Enforcement"
          description="Restrict ERP login to users connecting from approved office IP ranges or GPS locations. Separate from attendance enforcement."
          enabled={appAccessEnabled}
          onToggle={setAppAccessEnabled}
          badgeLabel="Plane A — App Security"
          badgeVariant="secondary"
          warning={gpsWarning}
        >
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className={`text-2xl font-bold ${(scope?.appAccessGpsIp.workLocationsWithCoords ?? 0) === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {scope?.appAccessGpsIp.workLocationsWithCoords ?? 0} / {scope?.appAccessGpsIp.workLocationsTotal ?? 0}
              </p>
              <p className="text-muted-foreground mt-0.5">Locations with GPS set</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-2xl font-bold">{scope?.appAccessGpsIp.workLocationsTotal ?? 0}</p>
              <p className="text-muted-foreground mt-0.5">Active work locations</p>
            </div>
          </div>
          <Alert className="py-2.5 border-amber-100 bg-amber-50/50 dark:bg-amber-950/20">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
              Configure GPS coordinates and IP allowlists on each Work Location before enabling.
              Locations without coordinates will pass-through (no geofence enforcement).
              Superuser is always exempt from GPS/IP blocking.
            </AlertDescription>
          </Alert>
        </LayerCard>

        {/* ══ LAYER 4 — Attendance GPS/IP Enforcement ════════════════════════ */}
        <LayerCard
          num={4}
          icon={ClipboardList}
          title="Attendance GPS/IP Enforcement"
          description="Restrict attendance check-in to users within the approved office geofence or IP range. Uses spoofing detection. Separate from application access."
          enabled={attendanceGpsEnabled}
          onToggle={setAttendanceGpsEnabled}
          badgeLabel="Plane B — Attendance"
          badgeVariant="outline"
          warning={
            attendanceGpsEnabled && (scope?.attendanceGpsIp.gpsWarning)
              ? gpsWarning : undefined
          }
        >
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className={`text-2xl font-bold ${(scope?.attendanceGpsIp.workLocationsWithCoords ?? 0) === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {scope?.attendanceGpsIp.workLocationsWithCoords ?? 0} / {scope?.attendanceGpsIp.workLocationsTotal ?? 0}
              </p>
              <p className="text-muted-foreground mt-0.5">Locations with GPS set</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-2xl font-bold text-blue-600">Advisory</p>
              <p className="text-muted-foreground mt-0.5">Currently audit-only</p>
            </div>
          </div>

          {/* Current policy tiers */}
          {(scope?.attendanceGpsIp.policies ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Current Policy Tiers
              </p>
              <div className="space-y-1.5">
                {scope!.attendanceGpsIp.policies.map((p) => (
                  <div key={p.policyName} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-xs">
                    <div>
                      <span className="font-medium">{p.policyName}</span>
                      <span className="text-muted-foreground ml-2">{p.applyToRoles?.join(', ')}</span>
                    </div>
                    <Badge variant={p.policyMode === 'exempt' ? 'secondary' : 'outline'} className="text-[10px] h-4 px-1.5">
                      {p.policyMode}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Alert className="py-2.5 border-blue-100 bg-blue-50/50 dark:bg-blue-950/20">
            <Eye className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <AlertDescription className="text-xs text-blue-800 dark:text-blue-300">
              Enabling this promotes the advisory GPS audit from monitoring-only to enforced blocking.
              Superuser, General Manager, and Senior Manager are permanently exempt.
            </AlertDescription>
          </Alert>
        </LayerCard>

        {/* ══ LAYER 5 — Attendance & Payroll Module Re-Auth ══════════════════ */}
        <LayerCard
          num={5}
          icon={Lock}
          title="Attendance & Payroll Module Re-Authentication"
          description="Require TOTP re-authentication for attendance overrides and payroll actions (in addition to session login)."
          enabled={reauthEnabled}
          onToggle={setReauthEnabled}
          badgeLabel="Planes A + B"
          badgeVariant="secondary"
        >
          <div className="space-y-1.5">
            {[
              ['attendance.override_admin',        'Admin attendance override'],
              ['attendance.regularisation_approve','Regularisation approval'],
              ['payroll.run_official',             'Run official payroll'],
              ['payroll.lock_period',              'Lock payroll period'],
              ['payroll.approve_increment',        'Approve salary increment'],
              ['salary.update_base',               'Update base salary'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between p-2 rounded-md bg-muted/30 text-xs">
                <span className="font-medium">{label}</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-blue-600 border-blue-300">TOTP gated</Badge>
              </div>
            ))}
          </div>
          <Alert className="py-2.5 border-green-100 bg-green-50/50 dark:bg-green-950/20">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
            <AlertDescription className="text-xs text-green-800 dark:text-green-300">
              Re-auth gates only affect who can submit a change. Payroll calculations remain unchanged.
              payroll-salary-core.ts is not modified.
            </AlertDescription>
          </Alert>
        </LayerCard>

        {/* ══ LAYER 6 — Security Audit Logging ═══════════════════════════════ */}
        <Card className={`transition-all ${auditMasterOn ? 'border-blue-200 dark:border-blue-800' : ''}`}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold
                ${auditMasterOn ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>6</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Database className={`h-4 w-4 ${auditMasterOn ? 'text-blue-600' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-semibold">Security Audit Logging</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">All Planes</Badge>
                  {auditMasterOn && <Badge className="bg-blue-600 text-white text-[10px] h-4 px-1.5">Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Immutable audit and event logging for all security operations.
                </p>
                <div className="mt-4 pt-4 border-t grid grid-cols-1 gap-2">
                  {[
                    { id: 'login',   label: 'Login & Session Audit', desc: 'Login attempts, session start/end, IP changes', val: loginAuditEnabled,   set: setLoginAuditEnabled },
                    { id: 'attend',  label: 'Attendance Location Audit', desc: 'GPS/IP audit log at every check-in', val: attendAuditEnabled,  set: setAttendAuditEnabled },
                    { id: 'archive', label: 'Log Archival (Nightly)', desc: 'Nightly archival of security logs to GCS', val: archivalEnabled,    set: setArchivalEnabled },
                    { id: 'monitor', label: 'Security Monitoring', desc: 'Real-time anomaly and pattern detection', val: monitoringEnabled,   set: setMonitoringEnabled },
                  ].map(({ id, label, desc, val, set }) => (
                    <div key={id} className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Switch checked={val} onCheckedChange={set} className="shrink-0 mt-0.5" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══ LAYER 7 — Payroll Impact Review ════════════════════════════════ */}
        <LayerCard
          num={7}
          icon={BadgeAlert}
          title="Payroll Impact Review Queue"
          description="Surface attendance and security violations (e.g. outside geofence, spoofing flags) in an HR review queue. Human-reviewed — does not automatically alter payroll."
          enabled={payrollReviewEnabled}
          onToggle={setPayrollReviewEnabled}
          badgeLabel="Plane B + Governance"
          badgeVariant="outline"
        >
          <Alert className="py-2.5 border-amber-100 bg-amber-50/50 dark:bg-amber-950/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              This creates a review queue for human decision-making only.
              It does NOT create LWP entries, does NOT alter payroll calculations, and does NOT
              change attendance status. payroll-salary-core.ts is not affected.
            </AlertDescription>
          </Alert>
          <div className="p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            Violations flagged: geofence breach, GPS spoofing, IP mismatch.
            HR/admin reviews each flag and decides if a manual payroll adjustment is warranted.
            All review decisions are audit-logged.
          </div>
        </LayerCard>

        {/* ══ SAVE ROW ═══════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between pt-1 gap-3">
          <div className="text-xs text-muted-foreground">
            {savedAt ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Saved {fmtDateTime(savedAt)}
              </span>
            ) : scope?.twoFa.updatedAt ? (
              <span>Last updated {fmtDateTime(scope.twoFa.updatedAt)}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-destructive border-destructive/40 hover:bg-destructive/5 gap-1.5"
              onClick={() => toast({
                title: 'Emergency Disable',
                description: 'Contact a second Superuser to co-authorise an emergency disable via the security emergency log.',
                variant: 'destructive',
              })}
            >
              <Zap className="h-3.5 w-3.5" />
              Emergency Disable
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? 'Saving…' : 'Save Policy'}
            </Button>
          </div>
        </div>

        {/* ══ LIVE POLICY SUMMARY ════════════════════════════════════════════ */}
        <Card className="border border-dashed">
          <CardHeader className="pb-2 pt-4">
            <button
              className="flex items-center gap-2 w-full text-left"
              onClick={() => setShowSummary(v => !v)}
            >
              <div className="h-2 w-2 rounded-full shrink-0 bg-blue-500" />
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Live Policy Summary
              </CardTitle>
              {showSummary
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
            </button>
          </CardHeader>
          {showSummary && (
            <CardContent className="pt-0 pb-4">
              <div className="space-y-2">
                {[
                  { num: 0, label: 'Role Scope',                     active: scopeRoles.length > 0, detail: scopeRoles.length > 0 ? scopeRoles.join(', ') : 'None selected' },
                  { num: 1, label: '2-Step Verification',           active: twoFaEnabled,          detail: twoFaEnabled ? `${twoFaMode === 'enforced' ? 'Required Immediately' : 'Required From Date'}` : 'Off' },
                  { num: 2, label: 'Trusted Device Enforcement',    active: trustedDeviceEnabled,   detail: trustedDeviceEnabled ? `${scope?.trustedDevice.activeDevices ?? 0} active devices` : 'Off' },
                  { num: 3, label: 'App Access GPS/IP',             active: appAccessEnabled,       detail: appAccessEnabled ? (scope?.appAccessGpsIp.gpsWarning ? '⚠ No GPS coords set' : 'Enforced') : 'Off' },
                  { num: 4, label: 'Attendance GPS/IP',             active: attendanceGpsEnabled,   detail: attendanceGpsEnabled ? (scope?.attendanceGpsIp.gpsWarning ? '⚠ No GPS coords set' : 'Enforced') : 'Advisory only' },
                  { num: 5, label: 'Attendance & Payroll Re-Auth',  active: reauthEnabled,          detail: reauthEnabled ? '6 actions gated' : 'Off' },
                  { num: 6, label: 'Security Audit Logging',        active: auditMasterOn,          detail: [loginAuditEnabled && 'Login', attendAuditEnabled && 'Attendance', archivalEnabled && 'Archival', monitoringEnabled && 'Monitoring'].filter(Boolean).join(' · ') || 'All off' },
                  { num: 7, label: 'Payroll Impact Review',         active: payrollReviewEnabled,   detail: payrollReviewEnabled ? 'HR review queue active' : 'Off' },
                ].map(({ num, label, active, detail }) => (
                  <div key={num} className="flex items-center gap-3 text-xs">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold
                      ${active ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>{num}</div>
                    <span className={`w-52 shrink-0 ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
                    <span className={active ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground italic'}>{detail}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-3" />

              {/* Rollback guidance */}
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30">
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Rollback guidance</p>
                  <p>All policy changes are permanently recorded in <code className="bg-muted px-1 rounded">two_fa_policy_audit_log</code> and <code className="bg-muted px-1 rounded">reauth_audit_log</code>.</p>
                  <p>To roll back: toggle the relevant layer off on this page and save with TOTP. Audit logs are immutable and remain intact after rollback.</p>
                  <p>For a full emergency reset, use the Emergency Disable button above (requires co-authorisation).</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

      </div>
    </Layout>
  );
}
