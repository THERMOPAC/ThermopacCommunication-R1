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
import { fmtDateTime } from '@/lib/date-utils';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Save,
  Loader2,
  AlertTriangle,
  Info,
  Clock,
  Calendar,
  Users,
  CheckCircle2,
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
  { value: 'HR',               label: 'HR' },
];

function derivedFeatureEnabled(mode: string, roles: string[]): boolean {
  return mode !== 'optional' || roles.length > 0;
}

export default function TwoFaPolicyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: policy, isLoading } = useQuery<TwoFaPolicy>({
    queryKey: ['/api/admin/2fa-policy'],
  });

  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [enforcementMode, setEnforcementMode] = useState<'optional' | 'required_from_date' | 'enforced'>('optional');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [enforcementFromDate, setEnforcementFromDate] = useState('');
  const [gracePeriodEnabled, setGracePeriodEnabled] = useState(true);
  const [gracePeriodDays, setGracePeriodDays] = useState(14);
  const [initialised, setInitialised] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (policy && !initialised) {
      const enabled = derivedFeatureEnabled(policy.enforcementMode, policy.applyToRoles);
      setFeatureEnabled(enabled);
      setEnforcementMode(policy.enforcementMode);
      setSelectedRoles(policy.applyToRoles ?? []);
      setEnforcementFromDate(policy.enforcementFromDate ?? '');
      setGracePeriodEnabled(policy.gracePeriodEnabled);
      setGracePeriodDays(policy.gracePeriodDays);
      setInitialised(true);
    }
  }, [policy, initialised]);

  const saveMutation = useReauthMutation<TwoFaPolicy, void>({
    mutationFn: async () => {
      const body = {
        enforcementMode: featureEnabled ? enforcementMode : 'optional',
        applyToRoles: featureEnabled ? selectedRoles : [],
        enforcementFromDate:
          featureEnabled && enforcementMode === 'required_from_date' ? enforcementFromDate || null : null,
        gracePeriodEnabled: featureEnabled ? gracePeriodEnabled : false,
        gracePeriodDays: gracePeriodDays,
      };

      const res = await fetch('/api/admin/2fa-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === 'REAUTH_REQUIRED') throw data;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/admin/2fa-policy'] });
      setInitialised(false);
      setSavedAt(new Date().toISOString());
      toast({ title: 'Policy saved', description: '2FA enforcement policy has been updated.' });
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

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const canSave =
    !saveMutation.isPending &&
    (!featureEnabled || enforcementMode !== 'required_from_date' || !!enforcementFromDate) &&
    (!featureEnabled || selectedRoles.length > 0 || enforcementMode === 'optional');

  const modeLabel: Record<string, string> = {
    optional:            'Optional',
    enforced:            'Required Immediately',
    required_from_date:  'Required From Date',
  };

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

      <div className="p-6 max-w-2xl mx-auto space-y-6">

        {/* ── Page Header ── */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">2-Step Verification Policy</h1>
            <p className="text-sm text-muted-foreground">
              Control organisation-wide two-factor authentication enforcement
            </p>
          </div>
          {policy && (
            <Badge
              variant="outline"
              className={
                policy.enforcementMode === 'enforced'
                  ? 'ml-auto border-green-300 text-green-700 dark:text-green-400'
                  : policy.enforcementMode === 'required_from_date'
                  ? 'ml-auto border-amber-300 text-amber-700 dark:text-amber-400'
                  : 'ml-auto'
              }
            >
              {policy.enforcementMode === 'enforced' && <ShieldCheck className="h-3 w-3 mr-1" />}
              {policy.enforcementMode === 'required_from_date' && <Clock className="h-3 w-3 mr-1" />}
              {policy.enforcementMode === 'optional' && <Info className="h-3 w-3 mr-1" />}
              {modeLabel[policy.enforcementMode]}
            </Badge>
          )}
        </div>

        {/* ── REAUTH notice ── */}
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/40">
          <ShieldAlert className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
            Saving this policy requires TOTP verification. You will be prompted to enter your
            authenticator code when you click Save.
          </AlertDescription>
        </Alert>

        {/* ── Master Enable ── */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {featureEnabled
                  ? <ShieldCheck className="h-5 w-5 text-green-600" />
                  : <Shield className="h-5 w-5 text-muted-foreground" />
                }
                <div>
                  <p className="text-sm font-semibold">Enable 2-Step Verification Feature</p>
                  <p className="text-xs text-muted-foreground">
                    {featureEnabled
                      ? 'Active — enforcement settings below are in effect'
                      : 'Off — no 2FA requirements applied to any user'}
                  </p>
                </div>
              </div>
              <Switch
                checked={featureEnabled}
                onCheckedChange={(v) => {
                  setFeatureEnabled(v);
                  if (!v) {
                    setEnforcementMode('optional');
                    setSelectedRoles([]);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Settings (only visible when enabled) ── */}
        {featureEnabled && (
          <>
            {/* Enforcement Policy */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Enforcement Policy</CardTitle>
                <CardDescription className="text-xs">
                  Choose when users are required to complete 2FA setup
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={enforcementMode}
                  onValueChange={(v) => setEnforcementMode(v as typeof enforcementMode)}
                  className="space-y-3"
                >
                  {/* Optional */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="optional" id="mode-optional" className="mt-0.5" />
                    <Label htmlFor="mode-optional" className="cursor-pointer flex-1">
                      <span className="font-medium text-sm">Optional</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Users can set up 2FA voluntarily. No enforcement.
                      </p>
                    </Label>
                  </div>

                  {/* Required Immediately */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="enforced" id="mode-enforced" className="mt-0.5" />
                    <Label htmlFor="mode-enforced" className="cursor-pointer flex-1">
                      <span className="font-medium text-sm">Required Immediately</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Scoped users must complete 2FA setup on next login.
                      </p>
                    </Label>
                    {enforcementMode === 'enforced' && (
                      <Badge className="bg-green-600 text-white text-[10px] shrink-0">Active</Badge>
                    )}
                  </div>

                  {/* Required From Date */}
                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="required_from_date" id="mode-date" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="mode-date" className="cursor-pointer">
                        <span className="font-medium text-sm">Required From Date</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enforcement begins on a specific date. Users are notified in advance.
                        </p>
                      </Label>
                      {enforcementMode === 'required_from_date' && (
                        <div className="mt-3 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input
                            type="date"
                            value={enforcementFromDate}
                            onChange={(e) => setEnforcementFromDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="h-8 text-sm w-44"
                          />
                          {!enforcementFromDate && (
                            <span className="text-xs text-destructive">Date required</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Scope */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Scope</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Select which roles this policy applies to
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {ALL_ROLES.map((role) => (
                    <div
                      key={role.value}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => toggleRole(role.value)}
                    >
                      <Checkbox
                        id={`role-${role.value}`}
                        checked={selectedRoles.includes(role.value)}
                        onCheckedChange={() => toggleRole(role.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Label
                        htmlFor={`role-${role.value}`}
                        className="text-sm cursor-pointer leading-none"
                      >
                        {role.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {featureEnabled && enforcementMode !== 'optional' && selectedRoles.length === 0 && (
                  <p className="text-xs text-destructive mt-3 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    At least one role must be selected when enforcement is active
                  </p>
                )}
                {selectedRoles.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    {selectedRoles.length} role{selectedRoles.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Grace Period */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Grace Period</CardTitle>
                <CardDescription className="text-xs">
                  Allow users time to set up 2FA before being locked out
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Allow login without 2FA after enforcement starts</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Users can still log in for the grace period while setting up 2FA
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
                      <Label className="text-sm text-muted-foreground whitespace-nowrap">
                        Grace period duration
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        value={gracePeriodDays}
                        onChange={(e) => setGracePeriodDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                        className="h-8 w-20 text-sm text-center"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Footer: last saved + Save button ── */}
        <div className="flex items-center justify-between pt-2">
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
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="gap-2"
          >
            {saveMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />
            }
            {saveMutation.isPending ? 'Saving…' : 'Save Policy'}
          </Button>
        </div>

        {/* ── Current state summary ── */}
        {policy && (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Current Live Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-32 shrink-0">Enforcement Mode</span>
                <span className="font-medium">{modeLabel[policy.enforcementMode]}</span>
              </div>
              {policy.enforcementFromDate && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-32 shrink-0">Effective From</span>
                  <span className="font-medium">{policy.enforcementFromDate}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-32 shrink-0">Applied Roles</span>
                <span className="font-medium">
                  {policy.applyToRoles?.length
                    ? policy.applyToRoles.join(', ')
                    : <span className="text-muted-foreground italic">None (feature off)</span>
                  }
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-32 shrink-0">Grace Period</span>
                <span className="font-medium">
                  {policy.gracePeriodEnabled ? `${policy.gracePeriodDays} days` : 'Disabled'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
