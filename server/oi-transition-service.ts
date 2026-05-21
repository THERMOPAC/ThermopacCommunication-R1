import { OiIssue } from "@shared/schema";

export class TransitionError extends Error {
  constructor(public code: string, public httpStatus: number) {
    super(code);
  }
}

// Phase 1A permitted transitions only.
// Future phases extend this map without schema changes.
const PHASE_1A_TRANSITIONS: Record<string, string[]> = {
  captured:      ["classified", "withdrawn"],
  classified:    ["investigating", "withdrawn"],
  investigating: ["verified", "withdrawn"],
  verified:      ["closed", "reopened"],
  closed:        ["reopened"],
  reopened:      ["classified"],
};

const ROLE_TRANSITION_MAP: Record<string, string[]> = {
  "captured->classified":      ["Manager", "Senior Manager", "General Manager", "Superuser"],
  "captured->withdrawn":       ["Superuser"],
  "classified->investigating":  ["Manager", "Senior Manager", "General Manager", "Superuser"],
  "classified->withdrawn":     ["Superuser"],
  "investigating->verified":   ["Senior Manager", "General Manager", "Superuser"],
  "investigating->withdrawn":  ["Superuser"],
  "verified->closed":          ["General Manager", "Superuser"],
  "verified->reopened":        ["Manager", "Senior Manager", "General Manager", "Superuser"],
  "closed->reopened":          ["Manager", "Senior Manager", "General Manager", "Superuser"],
  "reopened->classified":      ["Manager", "Senior Manager", "General Manager", "Superuser"],
};

export function validateTransition(
  issue: OiIssue,
  to: string,
  actorRole: string,
  reason?: string
): void {
  const allowed = PHASE_1A_TRANSITIONS[issue.status];
  if (!allowed || !allowed.includes(to)) {
    throw new TransitionError("transition_not_allowed", 422);
  }

  // Phase 1A block: S1/S2 cannot advance past investigating
  if (to === "verified" && (issue.severity === "S1" || issue.severity === "S2")) {
    throw new TransitionError("phase_not_implemented", 422);
  }

  const key = `${issue.status}->${to}`;
  const permitted = ROLE_TRANSITION_MAP[key] ?? [];
  if (!permitted.includes(actorRole)) {
    throw new TransitionError("forbidden", 403);
  }

  if (to === "withdrawn" && !reason) {
    throw new TransitionError("withdrawal_reason_required", 422);
  }
  if (to === "reopened" && !reason) {
    throw new TransitionError("reopen_reason_required", 422);
  }
}

export function getAllowedTransitions(issue: OiIssue, actorRole: string): string[] {
  const allowed = PHASE_1A_TRANSITIONS[issue.status] ?? [];
  return allowed.filter(to => {
    try {
      validateTransition(issue, to, actorRole, to === "withdrawn" || to === "reopened" ? "placeholder" : undefined);
      return true;
    } catch {
      return false;
    }
  });
}
