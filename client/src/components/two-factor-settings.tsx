import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, ShieldOff, Copy, Download, Loader2, KeyRound, AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function TwoFactorSettings() {
  const { toast } = useToast();
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [setupData, setSetupData] = useState<{ qrCode: string; manualKey: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [password, setPassword] = useState('');

  const statusQuery = useQuery({
    queryKey: ['/api/2fa/status'],
  });

  const status = statusQuery.data as { enabled: boolean; remainingBackupCodes: number } | undefined;

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/2fa/setup', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to initiate setup');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSetupData({ qrCode: data.qrCode, manualKey: data.manualKey });
      setShowSetupDialog(true);
    },
    onError: (err: any) => {
      toast({ title: "Setup Failed", description: err.message, variant: "destructive" });
    },
  });

  const verifySetupMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch('/api/2fa/verify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Verification failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setVerifyCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/2fa/status'] });
      toast({ title: "2FA Enabled", description: "Two-factor authentication is now active." });
    },
    onError: (err: any) => {
      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch('/api/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to disable');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowDisableDialog(false);
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['/api/2fa/status'] });
      toast({ title: "2FA Disabled", description: "Two-factor authentication has been turned off." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch('/api/2fa/regenerate-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to regenerate');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setShowRegenerateDialog(false);
      setPassword('');
      queryClient.invalidateQueries({ queryKey: ['/api/2fa/status'] });
      toast({ title: "Codes Regenerated", description: "New backup codes have been generated." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join('\n'));
      toast({ title: "Copied", description: "Backup codes copied to clipboard." });
    }
  };

  const downloadBackupCodes = () => {
    if (backupCodes) {
      const text = "THERMOPAC QMS - 2FA Backup Recovery Codes\n" +
        "==========================================\n" +
        "Each code can only be used once.\n" +
        "Store these codes in a safe place.\n\n" +
        backupCodes.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thermopac-2fa-backup-codes.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const closeSetupDialog = () => {
    setShowSetupDialog(false);
    setSetupData(null);
    setBackupCodes(null);
    setVerifyCode('');
  };

  if (statusQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
            </div>
            {status?.enabled ? (
              <Badge variant="default" className="bg-green-600">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary">
                <ShieldOff className="h-3 w-3 mr-1" />
                Disabled
              </Badge>
            )}
          </div>
          <CardDescription>
            Add an extra layer of security using an authenticator app like Google Authenticator or Microsoft Authenticator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.enabled ? (
            <>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">Backup Codes Remaining</p>
                  <p className="text-xs text-muted-foreground">
                    {status.remainingBackupCodes} of 10 codes available
                  </p>
                </div>
                {status.remainingBackupCodes <= 3 && (
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPassword(''); setShowRegenerateDialog(true); }}
                >
                  <KeyRound className="h-4 w-4 mr-1" />
                  Regenerate Backup Codes
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setPassword(''); setShowDisableDialog(true); }}
                >
                  <ShieldOff className="h-4 w-4 mr-1" />
                  Disable 2FA
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
              {setupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ShieldCheck className="h-4 w-4 mr-1" />
              Enable Two-Factor Authentication
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSetupDialog} onOpenChange={(open) => { if (!open) closeSetupDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {backupCodes ? 'Save Your Backup Codes' : 'Set Up Two-Factor Authentication'}
            </DialogTitle>
            <DialogDescription>
              {backupCodes
                ? 'Save these codes in a safe place. Each code can only be used once.'
                : 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.'
              }
            </DialogDescription>
          </DialogHeader>

          {backupCodes ? (
            <div className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800 text-sm">
                  These codes will not be shown again. Save them now.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
                {backupCodes.map((code, i) => (
                  <div key={i} className="px-2 py-1">{code}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyBackupCodes} className="flex-1">
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadBackupCodes} className="flex-1">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeSetupDialog} className="w-full">
                  I've Saved My Codes
                </Button>
              </DialogFooter>
            </div>
          ) : setupData ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img src={setupData.qrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={setupData.manualKey}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(setupData.manualKey);
                      toast({ title: "Copied", description: "Key copied to clipboard." });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Enter 6-digit verification code</Label>
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center font-mono text-lg tracking-widest"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <Button
                onClick={() => verifySetupMutation.mutate(verifyCode)}
                disabled={verifyCode.length !== 6 || verifySetupMutation.isPending}
                className="w-full"
              >
                {verifySetupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify and Enable
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Enter your password to confirm. Your account will be less secure without 2FA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDisableDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => disableMutation.mutate(password)}
                disabled={!password || disableMutation.isPending}
              >
                {disableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Disable 2FA
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate Backup Codes</DialogTitle>
            <DialogDescription>
              This will invalidate all existing backup codes. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => regenerateMutation.mutate(password)}
                disabled={!password || regenerateMutation.isPending}
              >
                {regenerateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Regenerate
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {backupCodes && !showSetupDialog && (
        <Dialog open={true} onOpenChange={() => setBackupCodes(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Backup Codes</DialogTitle>
              <DialogDescription>
                Save these codes in a safe place. Each code can only be used once.
              </DialogDescription>
            </DialogHeader>
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800 text-sm">
                Previous codes are now invalid. Save these new codes.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
              {backupCodes.map((code, i) => (
                <div key={i} className="px-2 py-1">{code}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyBackupCodes} className="flex-1">
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadBackupCodes} className="flex-1">
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setBackupCodes(null)} className="w-full">
                I've Saved My Codes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
