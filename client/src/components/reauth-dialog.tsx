import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { _registerReauthStateUpdater, type ChallengeType } from '@/hooks/use-reauth';

interface ReauthState {
  open: boolean;
  actionKey: string;
  challengeType: ChallengeType;
  timeoutMinutes: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  'payroll.run_official': 'Run Official Payroll',
  'payroll.lock_period': 'Lock Payroll Period',
  'payroll.approve_increment': 'Approve Salary Increment',
  'salary.update_bank_details': 'Update Bank Details',
  'salary.update_base': 'Update Base Salary',
  'user.change_role': 'Change User Role',
  'user.change_permissions': 'Change Module Permissions',
  'user.disable_2fa': 'Disable Two-Factor Authentication',
  'user.reset_2fa': 'Reset 2FA Device',
  'security.update_login_policy': 'Update Login Security Policy',
  'security.update_attendance_policy': 'Update Attendance Policy',
  'security.update_2fa_policy': 'Update 2FA Policy',
  'security.revoke_session': 'Revoke Active Session',
  'security.grant_device_trust': 'Grant Device Trust',
  'security.force_logout': 'Force Logout All Sessions',
};

export function ReauthDialog() {
  const { toast } = useToast();
  const [state, setState] = useState<ReauthState | null>(null);
  const [credential, setCredential] = useState('');
  const [credentialType, setCredentialType] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    _registerReauthStateUpdater((newState) => setState(newState));
    return () => _registerReauthStateUpdater(() => {});
  }, []);

  useEffect(() => {
    if (state?.open) {
      setCredential('');
      setError(null);
      setIsLoading(false);
      setCredentialType(state.challengeType === 'totp' ? 'totp' : 'password');
    }
  }, [state?.open, state?.actionKey]);

  if (!state) return null;

  const actionLabel = ACTION_LABELS[state.actionKey] ?? state.actionKey;

  async function handleCancel() {
    try {
      await fetch('/api/security/reauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionKey: state!.actionKey, cancelled: true }),
      });
    } catch {
      // best-effort
    }
    state.onCancel();
    setState(null);
    toast({
      title: 'Action cancelled',
      description: 'Re-authentication is required to proceed with this action.',
      variant: 'destructive',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!credential.trim()) {
      setError('Please enter your credential.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/security/reauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionKey: state!.actionKey,
          credential: credential.trim(),
          credentialType,
        }),
      });

      const body = await resp.json();

      if (!resp.ok) {
        setError(body.message ?? 'Invalid credential. Please try again.');
        setCredential('');
        return;
      }

      const cb = state.onSuccess;
      setState(null);
      cb();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  const showTabs = state.challengeType === 'any';

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => { if (!open && !isLoading) handleCancel(); }}
    >
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <DialogTitle>Confirm Your Identity</DialogTitle>
          </div>
          <DialogDescription>
            Re-authentication is required to perform:{' '}
            <span className="font-medium text-foreground">{actionLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {showTabs ? (
            <Tabs
              value={credentialType}
              onValueChange={(v) => { setCredentialType(v as 'password' | 'totp'); setCredential(''); setError(null); }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
                <TabsTrigger value="totp" className="flex-1">Authenticator Code</TabsTrigger>
              </TabsList>
              <TabsContent value="password" className="mt-3">
                <div className="space-y-2">
                  <Label htmlFor="reauth-password">Your Password</Label>
                  <Input
                    id="reauth-password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder="Enter your password"
                    value={credential}
                    onChange={(e) => { setCredential(e.target.value); setError(null); }}
                    disabled={isLoading}
                  />
                </div>
              </TabsContent>
              <TabsContent value="totp" className="mt-3">
                <div className="space-y-2">
                  <Label htmlFor="reauth-totp">6-Digit Authenticator Code</Label>
                  <Input
                    id="reauth-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="000000"
                    className="tracking-widest text-center text-lg"
                    value={credential}
                    onChange={(e) => { setCredential(e.target.value.replace(/\D/g, '')); setError(null); }}
                    disabled={isLoading}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : state.challengeType === 'totp' ? (
            <div className="space-y-2">
              <Label htmlFor="reauth-totp-only">6-Digit Authenticator Code</Label>
              <Input
                id="reauth-totp-only"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                className="tracking-widest text-center text-lg"
                value={credential}
                onChange={(e) => { setCredential(e.target.value.replace(/\D/g, '')); setError(null); }}
                disabled={isLoading}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reauth-pw-only">Your Password</Label>
              <Input
                id="reauth-pw-only"
                type="password"
                autoComplete="current-password"
                autoFocus
                placeholder="Enter your password"
                value={credential}
                onChange={(e) => { setCredential(e.target.value); setError(null); }}
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !credential.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
