import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Shield, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { PasswordChangeDialog } from "@/components/password-change-dialog";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function AuthPage() {
  const { user, loginMutation, twoFactorChallenge, clearTwoFactorChallenge, verify2FAMutation, verifyBackup2FAMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [userNeedsPasswordUpdate, setUserNeedsPasswordUpdate] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordKey, setForgotPasswordKey] = useState(0);

  useEffect(() => {
    if (user) {
      if (user.requiresPasswordUpdate || user.passwordNeedsUpdate) {
        setUserNeedsPasswordUpdate(true);
        setShowPasswordDialog(true);
      } else {
        setLocation("/");
      }
    }
  }, [user, setLocation]);

  if (user && !userNeedsPasswordUpdate) {
    return <div className="flex items-center justify-center h-screen">Redirecting...</div>;
  }

  const handlePasswordUpdateSuccess = () => {
    setShowPasswordDialog(false);
    setUserNeedsPasswordUpdate(false);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          <Alert className="border-blue-200 bg-blue-50">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Security Enhancement:</strong> We've implemented stronger password requirements 
              to better protect your account. All users must update their passwords.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="flex flex-col items-center">
              <img 
                src="/images/thermopac-logo.jpg" 
                alt="Thermopac Logo" 
                className="h-24 mb-4"
              />
              <CardTitle>Enterprise Resource Planning</CardTitle>
            </CardHeader>
            <CardContent>
              {twoFactorChallenge ? (
                <TwoFactorVerification
                  challengeToken={twoFactorChallenge.challengeToken}
                  onCancel={clearTwoFactorChallenge}
                  verify2FAMutation={verify2FAMutation}
                  verifyBackup2FAMutation={verifyBackup2FAMutation}
                />
              ) : showForgotPassword ? (
                <ForgotPasswordForm
                  key={forgotPasswordKey}
                  onBackToLogin={() => setShowForgotPassword(false)}
                />
              ) : (
                <LoginForm
                  loginMutation={loginMutation}
                  onForgotPassword={() => {
                    setForgotPasswordKey(k => k + 1);
                    setShowForgotPassword(true);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showPasswordDialog && userNeedsPasswordUpdate && (
        <PasswordChangeDialog
          isRequired={true}
          onSuccess={handlePasswordUpdateSuccess}
        />
      )}

      <div className="hidden lg:flex flex-1 bg-white items-center justify-center p-12 relative overflow-hidden">
        <div className="max-w-lg relative z-10 flex flex-col items-center">
          <img 
            src="/images/thermopac-logo.jpg" 
            alt="Thermopac Logo" 
            className="h-20 mb-6"
          />
          <h1 className="text-4xl font-bold mb-6 text-gray-800 text-center">Welcome to THERMOPAC ERP</h1>
          <p className="text-lg text-gray-600 text-center">
            A comprehensive enterprise resource planning platform for financial management, 
            quality control, production planning, HR administration, and business operations.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ loginMutation, onForgotPassword }: { loginMutation: any; onForgotPassword: () => void }) {
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700" 
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Login
        </Button>
        
        <div className="text-center">
          <Button 
            type="button"
            variant="link"
            onClick={onForgotPassword}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Forgot your password?
          </Button>
        </div>
      </form>
    </Form>
  );
}

function TwoFactorVerification({
  challengeToken,
  onCancel,
  verify2FAMutation,
  verifyBackup2FAMutation,
}: {
  challengeToken: string;
  onCancel: () => void;
  verify2FAMutation: any;
  verifyBackup2FAMutation: any;
}) {
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      verify2FAMutation.mutate({ challengeToken, code: fullCode });
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split('');
      setOtpDigits(newDigits);
      inputRefs.current[5]?.focus();
      verify2FAMutation.mutate({ challengeToken, code: pasted });
    }
  };

  const handleBackupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (backupCode.trim()) {
      verifyBackup2FAMutation.mutate({ challengeToken, backupCode: backupCode.trim() });
    }
  };

  const isPending = verify2FAMutation.isPending || verifyBackup2FAMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="p-1 h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <CardDescription className="font-medium text-foreground">
            Two-Factor Authentication
          </CardDescription>
          <CardDescription className="text-xs">
            {useBackupCode
              ? 'Enter one of your backup recovery codes'
              : 'Enter the 6-digit code from your authenticator app'
            }
          </CardDescription>
        </div>
      </div>

      {!useBackupCode ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <KeyRound className="h-12 w-12 text-blue-600 mb-2" />
          </div>

          <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="w-11 h-12 text-center text-lg font-mono"
                disabled={isPending}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {isPending && (
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          )}

          <div className="text-center pt-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setUseBackupCode(true)}
              className="text-sm text-muted-foreground"
            >
              Use a backup code instead
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleBackupSubmit} className="space-y-4">
          <div className="flex items-center justify-center">
            <Shield className="h-12 w-12 text-orange-600 mb-2" />
          </div>

          <Input
            type="text"
            placeholder="XXXX-XXXX"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
            className="text-center font-mono text-lg tracking-wider"
            disabled={isPending}
            autoFocus
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !backupCode.trim()}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify Backup Code
          </Button>

          <div className="text-center">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setUseBackupCode(false)}
              className="text-sm text-muted-foreground"
            >
              Use authenticator app instead
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
