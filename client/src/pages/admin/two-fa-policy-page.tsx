import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Helmet } from 'react-helmet';
import Layout from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useReauthMutation } from '@/hooks/use-reauth';
import { fmtDate, fmtDateTime } from '@/lib/date-utils';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Save,
  Loader2,
  AlertTriangle,
  Clock,
  CalendarDays,
  Users,
  CheckCircle2,
  Lock,
  Unlock,
} from 'lucide-react';

interface TwoFaPolicy {
  id: number;
  enforcementMode: 'optional' | 'required_from_date' | 'enforced';
  applyToRoles: string[];
  enforcementFromDate: string | null;
  gracePeriodEnabled: boolean;
  gracePeriodDays: number;
  updatedBy: number | null;
  updatedAt: string;
}

const ALL_ROLES = [
  { value: 'Superuser',        label: 'Superuser' },
  { value: 'General Manager',  label: 'General Manager' },
  { value: 'Senior Manager',   label: 'Senior Manager' },
  { value: 'Senior Executive', label: 'Senior Executive' },
  { value: 'Manager',          label: 'Manager' },
  { value: 'Employee',         label: 'Employee' },
];

const MODE_LABELS: Record<string, string> = {
  optional:           'Optional',
  enforced:           'Required Immediately',
  required_from_date: 'Required From Date',
};

const MODE_COLORS: Record<string, string> = {
  optional:           'text-muted-foreground',
  enforced:           'text-green-700 dark:text-green-400',
  required_from_date: 'text-amber-700 dark:text-amber-400',
};

export default function TwoFaPolicyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: policy, isLoading } = useQuery<TwoFaPolicy>({
    queryKey: ['/api/admin/2fa-policy'],
  });

  // ── local state mirrors DB ─────────────────────────────────────────────────
  const [featureEnabled, setFeatureEnabled]       = useState(false);
  const [enforcementMode, setEnforcementMode]     = useState<TwoFaPolicy['enforcementMode']>('optional');
  const [selectedRoles, setSelectedRoles]         = useState<string[]>([]);
  const [enforcementFromDate, setEnforcementFromDate] = useState('');
  const [gracePeriodEnabled, setGracePeriodEnabled]   = useState(true);
  const [gracePeriodDays, setGracePeriodDays]         = useState(14);
  const [initialised, setInitialised] = useState(false);
  const [savedAt, setSavedAt]         = useState<string | null>(null);

  useEffect(() => {
    if (policy && !initialised) {
      // feature is "enabled" if mode is anything other than optional, OR if roles are scoped
      setFeatureEnabled(policy.enforcementMode !== 'optional' || policy.applyToRoles.length > 0);
      setEnforcementMode(policy.enforcementMode);
      setSelectedRoles(policy.applyToRoles ?? []);
      setEnforcementFromDate(policy.enforcementFromDate ?? '');
      setGracePeriodEnabled(policy.gracePeriodEnabled);
      setGracePeriodDays(policy.gracePeriodDays);
      setInitialised(true);
    }
  }, [policy, initialised]);

  // ── save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useReauthMutation<TwoFaPolicy, void>({
    mutationFn: async () => {
      const effectiveMode  = featureEnabled ? enforcementMode : 'optional';
      const effectiveRoles = featureEnabled ? selectedRoles : [];
      const effectiveDate  =
        featureEnabled && enforcementMode === 'required_from_date'
          ? (enforcementFromDate || null)
          : null;

      const body = {
        enforcementMode:    effectiveMode,
        applyToRoles:       effectiveRoles,
        enforcementFromDate: effectiveDate,
        gracePeriodEnabled: featureEnabled ? gracePeriodEnabled : false,
        gracePeriodDays,
      };

      const res = await fetch('/api/admin/2fa-policy', {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/admin/2fa-policy'] });
      setInitialised(false);
      setSavedAt(new Date().toISOString());
      toast({ title: 'Policy saved', description: '2FA enforcement policy updated successfully.' });
    },
    onError: (err: any) => {
      if (err?.code === 'REAUTH_REQUIRED') return;
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Could not update the policy.',
        variant: 'destructive',
      });
    },
  });

  const toggleRole = (role: string) =>
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );

  // ── validation ─────────────────────────────────────────────────────────────
  const dateRequired = featureEnabled && enforcementMode === 'required_from_date' && !enforcementFromDate;
  const noRolesWhenRequired =
    featureEnabled && enforcementMode !== 'optional' && selectedRoles.length === 0;
  const canSave = !saveMutation.isPending && !dateRequired && !noRolesWhenRequired;

  // ── disabled state for sub-controls ───────────────────────────────────────
  const controlsDisabled = !featureEnabled;

  // ── live policy badge ──────────────────────────────────────────────────────
  const liveBadge = policy ? (
    <Badge
      variant="outline"
      className={
        policy.enforcementMode === 'enforced'
          ? 'border-green-300 text-green-700 dark:text-green-400'
          : policy.enforcementMode === 'required_from_date'
          ? 'border-amber-300 text-amber-700 dark:text-amber-400'
          : 'border-muted-foreground/40 text-muted-foreground'
      }
    >
      {policy.enforcementMode === 'enforced'           && <ShieldCheck className="h-3 w-3 mr-1" />}
      {policy.enforcementMode === 'required_from_date' && <Clock className="h-3 w-3 mr-1" />}
      {policy.enforcementMode === 'optional'           && <ShieldOff className="h-3 w-3 mr-1" />}
      {MODE_LABELS[policy.enforcementMode]}
    </Badge>
  ) : null;

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><title>2FA Enforcement Policy — THERMOPAC ERP</title></Helmet>

      <div className="p-6 max-w-2xl mx-auto space-y-5">

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg shrink-0">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">2-Step Verification Policy</h1>
              <p className="text-sm text-muted-foreground">
                Organisation-wide two-factor authentication enforcement
              </p>
            </div>
          </div>
          {liveBadge && <div className="pt-1">{liveBadge}</div>}
        </div>

        {/* ── REAUTH notice ─────────────────────────────────────────────────── */}
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/40 py-3">
          <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0" />
          <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
            Saving requires TOTP verification — your authenticator code will be requested on Save.
          </AlertDescription>
        </Alert>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Feature on/off
        ══════════════════════════════════════════════════════════════════ */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {featureEnabled
                  ? <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
                  : <ShieldOff  className="h-5 w-5 text-muted-foreground shrink-0" />
                }
                <div>
                  <p className="text-sm font-semibold">Enable 2-Step Verification Feature</p>
                  <p className="text-xs text-muted-foreground">
                    {featureEnabled
                      ? 'Active — enforcement settings below apply to selected roles'
                      : 'Off — 2FA is available but not required for any user'}
                  </p>
                </div>
              </div>
              <Switch
                checked={featureEnabled}
                onCheckedChange={setFeatureEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — Enforcement Policy
        ══════════════════════════════════════════════════════════════════ */}
        <Card className={controlsDisabled ? 'opacity-50 pointer-events-none select-none' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {controlsDisabled
                ? <Lock className="h-4 w-4 text-muted-foreground" />
                : <Unlock className="h-4 w-4 text-blue-500" />
              }
              <CardTitle className="text-sm font-semibold">Enforcement Policy</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Choose when users in the selected scope are required to complete 2FA setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={enforcementMode}
              onValueChange={(v) => setEnforcementMode(v as TwoFaPolicy['enforcementMode'])}
              className="space-y-3"
            >
              {/* Optional */}
              <label
                htmlFor="mode-optional"
                className="flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-950/30"
              >
                <RadioGroupItem value="optional" id="mode-optional" className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Optional</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    2FA is available but not enforced. Users may set it up voluntarily.
                  </p>
                </div>
              </label>

              {/* Required Immediately */}
              <label
                htmlFor="mode-enforced"
                className="flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-green-400 has-[:checked]:bg-green-50 dark:has-[:checked]:bg-green-950/30"
              >
                <RadioGroupItem value="enforced" id="mode-enforced" className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Required Immediately</p>
                    {enforcementMode === 'enforced' && (
                      <Badge className="bg-green-600 text-white text-[10px] h-4 px-1.5">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scoped users must complete 2FA setup on their next login.
                  </p>
                </div>
              </label>

              {/* Required From Date */}
              <label
                htmlFor="mode-date"
                className="flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-950/30"
              >
                <RadioGroupItem value="required_from_date" id="mode-date" className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Required From Date</p>
                    {enforcementMode === 'required_from_date' && (
                      <Badge className="bg-amber-500 text-white text-[10px] h-4 px-1.5">Scheduled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enforcement begins on a specific date. Users are notified in advance.
                  </p>

                  {/* Date picker — always rendered, highlighted when this mode is active */}
                  <div className="mt-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      type="date"
                      value={enforcementFromDate}
                      onChange={(e) => setEnforcementFromDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className={`h-8 text-sm w-44 ${
                        enforcementMode !== 'required_from_date' ? 'opacity-40' : ''
                      } ${dateRequired ? 'border-destructive ring-destructive' : ''}`}
                      disabled={enforcementMode !== 'required_from_date'}
                    />
                    {dateRequired && (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Required
                      </span>
                    )}
                  </div>
                </div>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — Scope
        ══════════════════════════════════════════════════════════════════ */}
        <Card className={controlsDisabled ? 'opacity-50 pointer-events-none select-none' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Scope</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Select which roles this enforcement policy applies to
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {ALL_ROLES.map((role) => {
                const checked = selectedRoles.includes(role.value);
                return (
                  <label
                    key={role.value}
                    htmlFor={`role-${role.value}`}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors
                      ${checked
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                        : 'bg-muted/20 hover:bg-muted/40'
                      }`}
                  >
                    <Checkbox
                      id={`role-${role.value}`}
                      checked={checked}
                      onCheckedChange={() => toggleRole(role.value)}
                    />
                    <span className="text-sm leading-none">{role.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              {noRolesWhenRequired ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  At least one role must be selected when enforcement is active
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {selectedRoles.length === 0
                    ? 'No roles selected — policy will not apply to anyone'
                    : `${selectedRoles.length} of ${ALL_ROLES.length} roles selected`
                  }
                </p>
              )}
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setSelectedRoles(ALL_ROLES.map(r => r.value))}
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setSelectedRoles([])}
                >
                  None
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 4 — Grace Period
        ══════════════════════════════════════════════════════════════════ */}
        <Card className={controlsDisabled ? 'opacity-50 pointer-events-none select-none' : ''}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Grace Period</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Allow users additional time to complete 2FA setup after enforcement begins
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  Allow login without 2FA for{' '}
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {gracePeriodEnabled ? `${gracePeriodDays} days` : '—'}
                  </span>{' '}
                  after enforcement starts
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gracePeriodEnabled
                    ? 'Users can still log in during the grace period while completing 2FA setup'
                    : '2FA is required immediately — no grace period after enforcement'}
                </p>
              </div>
              <Switch
                checked={gracePeriodEnabled}
                onCheckedChange={setGracePeriodEnabled}
              />
            </div>

            {gracePeriodEnabled && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap w-36 shrink-0">
                    Duration (days)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={gracePeriodDays}
                    onChange={(e) =>
                      setGracePeriodDays(Math.max(1, Math.min(90, Number(e.target.value))))
                    }
                    className="h-8 w-20 text-sm text-center"
                  />
                  <span className="text-sm text-muted-foreground">days (max 90)</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ══════════════════════════════════════════════════════════════════
            SAVE ROW
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-muted-foreground">
            {savedAt ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Saved {fmtDateTime(savedAt)}
              </span>
            ) : policy?.updatedAt ? (
              <span>Last updated {fmtDateTime(policy.updatedAt)}</span>
            ) : null}
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave} className="gap-2">
            {saveMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            {saveMutation.isPending ? 'Saving…' : 'Save Policy'}
          </Button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 5 — Live Policy Summary
        ══════════════════════════════════════════════════════════════════ */}
        {policy && (
          <Card className="border border-dashed">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full shrink-0 ${
                  policy.enforcementMode === 'enforced'
                    ? 'bg-green-500'
                    : policy.enforcementMode === 'required_from_date'
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/40'
                }`} />
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Live Policy Summary
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <div className="space-y-2.5">
                {/* Mode */}
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">Enforcement Mode</span>
                  <span className={`font-semibold ${MODE_COLORS[policy.enforcementMode]}`}>
                    {MODE_LABELS[policy.enforcementMode]}
                  </span>
                </div>

                {/* Activation Date */}
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">Activation Date</span>
                  {policy.enforcementFromDate ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      {fmtDate(policy.enforcementFromDate)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      {policy.enforcementMode === 'enforced' ? 'Immediate (already active)' : 'Not scheduled'}
                    </span>
                  )}
                </div>

                {/* Scope */}
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">Applied Roles</span>
                  {policy.applyToRoles?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {policy.applyToRoles.map(r => (
                        <Badge key={r} variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                          {ALL_ROLES.find(x => x.value === r)?.label ?? r}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">None — feature off</span>
                  )}
                </div>

                {/* Grace Period */}
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">Grace Period</span>
                  {policy.gracePeriodEnabled ? (
                    <span className="font-medium">
                      {policy.gracePeriodDays} days after enforcement begins
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Disabled — immediate lockout</span>
                  )}
                </div>

                {/* Last updated */}
                <Separator className="my-1" />
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted-foreground w-36 shrink-0">Last Updated</span>
                  <span className="text-muted-foreground">{fmtDateTime(policy.updatedAt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </Layout>
  );
}
