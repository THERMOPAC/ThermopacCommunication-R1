import { useState, useCallback, useRef } from 'react';

export type ChallengeType = 'password' | 'totp' | 'any';

export interface ReauthRequiredError {
  code: 'REAUTH_REQUIRED';
  actionKey: string;
  challengeType: ChallengeType;
  timeoutMinutes: number;
}

export function isReauthRequired(err: unknown): err is ReauthRequiredError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as any).code === 'REAUTH_REQUIRED'
  );
}

interface ReauthState {
  open: boolean;
  actionKey: string;
  challengeType: ChallengeType;
  timeoutMinutes: number;
  onSuccess: () => void;
  onCancel: () => void;
}

type ReauthStateUpdater = (state: ReauthState | null) => void;

let _setReauthState: ReauthStateUpdater | null = null;

export function _registerReauthStateUpdater(fn: ReauthStateUpdater) {
  _setReauthState = fn;
}

export function triggerReauth(
  err: ReauthRequiredError,
  onSuccess: () => void,
  onCancel: () => void,
) {
  if (!_setReauthState) {
    console.error('ReauthDialog not mounted — cannot show re-auth prompt');
    onCancel();
    return;
  }
  _setReauthState({
    open: true,
    actionKey: err.actionKey,
    challengeType: err.challengeType,
    timeoutMinutes: err.timeoutMinutes,
    onSuccess,
    onCancel,
  });
}

export async function parseReauthError(response: Response): Promise<ReauthRequiredError | null> {
  if (response.status !== 403) return null;
  try {
    const body = await response.clone().json();
    if (body?.code === 'REAUTH_REQUIRED') return body as ReauthRequiredError;
  } catch {
    // not JSON
  }
  return null;
}

export function useReauthMutation<TData = unknown, TVariables = unknown>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (err: unknown, variables: TVariables) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const pendingVarsRef = useRef<TVariables | null>(null);

  const mutate = useCallback(async (variables: TVariables) => {
    setIsPending(true);
    try {
      const data = await options.mutationFn(variables);
      options.onSuccess?.(data, variables);
    } catch (err: unknown) {
      if (isReauthRequired(err)) {
        pendingVarsRef.current = variables;
        setIsPending(false);
        triggerReauth(
          err,
          async () => {
            const vars = pendingVarsRef.current!;
            pendingVarsRef.current = null;
            setIsPending(true);
            try {
              const data = await options.mutationFn(vars);
              options.onSuccess?.(data, vars);
            } catch (retryErr) {
              options.onError?.(retryErr, vars);
            } finally {
              setIsPending(false);
            }
          },
          () => {
            pendingVarsRef.current = null;
            options.onError?.(new Error('Re-authentication cancelled'), variables);
          },
        );
        return;
      }
      options.onError?.(err, variables);
    } finally {
      setIsPending(false);
    }
  }, [options]);

  return { mutate, isPending };
}
