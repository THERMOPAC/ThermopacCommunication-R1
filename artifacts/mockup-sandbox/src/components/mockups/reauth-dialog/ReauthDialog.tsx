import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

type ChallengeType = "password" | "totp" | "any";
type ScenarioKey = "any" | "password" | "totp" | "loading" | "error";

const ACTION_LABELS: Record<string, string> = {
  "payroll.run_official": "Run Official Payroll",
  "payroll.lock_period": "Lock Payroll Period",
  "payroll.approve_increment": "Approve Salary Increment",
  "salary.update_bank_details": "Update Bank Details",
  "salary.update_base": "Update Base Salary",
  "user.change_role": "Change User Role",
  "user.change_permissions": "Change Module Permissions",
  "user.disable_2fa": "Disable Two-Factor Authentication",
  "user.reset_2fa": "Reset 2FA Device",
  "security.update_login_policy": "Update Login Security Policy",
  "security.update_attendance_policy": "Update Attendance Policy",
  "security.update_2fa_policy": "Update 2FA Policy",
  "security.revoke_session": "Revoke Active Session",
  "security.grant_device_trust": "Grant Device Trust",
  "security.force_logout": "Force Logout All Sessions",
};

interface DialogState {
  actionKey: string;
  challengeType: ChallengeType;
  error?: string;
  isLoading?: boolean;
}

function ReauthDialogCore({
  actionKey,
  challengeType,
  error: initialError,
  isLoading: initialLoading,
  onClose,
}: DialogState & { onClose: () => void }) {
  const [credential, setCredential] = useState("");
  const [credentialType, setCredentialType] = useState<"password" | "totp">(
    challengeType === "totp" ? "totp" : "password"
  );
  const [error] = useState<string | null>(initialError ?? null);
  const isLoading = initialLoading ?? false;

  const actionLabel = ACTION_LABELS[actionKey] ?? actionKey;
  const showTabs = challengeType === "any";

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <DialogTitle>Confirm Your Identity</DialogTitle>
          </div>
          <DialogDescription>
            Re-authentication is required to perform:{" "}
            <span className="font-medium text-foreground">{actionLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4 pt-2">
          {showTabs ? (
            <Tabs
              value={credentialType}
              onValueChange={(v) => {
                setCredentialType(v as "password" | "totp");
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="password" className="flex-1">
                  Password
                </TabsTrigger>
                <TabsTrigger value="totp" className="flex-1">
                  Authenticator Code
                </TabsTrigger>
              </TabsList>
              <TabsContent value="password" className="mt-3">
                <div className="space-y-2">
                  <Label htmlFor="reauth-password">Your Password</Label>
                  <Input
                    id="reauth-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
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
                    placeholder="000000"
                    className="tracking-widest text-center text-lg"
                    value={credential}
                    onChange={(e) =>
                      setCredential(e.target.value.replace(/\D/g, ""))
                    }
                    disabled={isLoading}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : challengeType === "totp" ? (
            <div className="space-y-2">
              <Label htmlFor="reauth-totp-only">6-Digit Authenticator Code</Label>
              <Input
                id="reauth-totp-only"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                className="tracking-widest text-center text-lg"
                value={credential}
                onChange={(e) =>
                  setCredential(e.target.value.replace(/\D/g, ""))
                }
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
                placeholder="Enter your password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
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
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !credential.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SCENARIOS: Record<
  ScenarioKey,
  { label: string; state: DialogState }
> = {
  any: {
    label: "Password OR Authenticator (tabs)",
    state: {
      actionKey: "payroll.run_official",
      challengeType: "any",
    },
  },
  password: {
    label: "Password only",
    state: {
      actionKey: "user.change_role",
      challengeType: "password",
    },
  },
  totp: {
    label: "TOTP only",
    state: {
      actionKey: "user.disable_2fa",
      challengeType: "totp",
    },
  },
  loading: {
    label: "Loading / Verifying state",
    state: {
      actionKey: "security.force_logout",
      challengeType: "password",
      isLoading: true,
    },
  },
  error: {
    label: "Error state (wrong credential)",
    state: {
      actionKey: "salary.update_bank_details",
      challengeType: "password",
      error: "Invalid credential. Please try again.",
    },
  },
};

export function ReauthDialog() {
  const [active, setActive] = useState<ScenarioKey>("any");
  const [open, setOpen] = useState(true);
  const scenario = SCENARIOS[active];

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col items-center justify-start p-6 gap-6">
      <div className="w-full max-w-lg">
        <h2 className="text-base font-semibold text-foreground mb-1">
          Phase 3 · Re-authentication Dialog
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Triggered when a user attempts a sensitive action. Select a scenario to preview:
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setActive(key);
                setOpen(true);
              }}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                active === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}
            >
              {SCENARIOS[key].label}
            </button>
          ))}
        </div>

        <div className="bg-background border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2 font-mono">
            actionKey: <span className="text-foreground">{scenario.state.actionKey}</span>
            {" · "}
            challengeType: <span className="text-foreground">{scenario.state.challengeType}</span>
            {scenario.state.isLoading && " · isLoading: true"}
            {scenario.state.error && " · error: injected"}
          </p>
          <div className="text-xs text-muted-foreground">
            Click <strong>"Open Dialog"</strong> to show the dialog overlay, or use the scenario buttons above.
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Open Dialog
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Close Dialog
          </Button>
        </div>
      </div>

      {open && (
        <ReauthDialogCore
          key={active}
          {...scenario.state}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
