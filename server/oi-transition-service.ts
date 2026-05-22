import { OiIssue } from "@shared/schema";
import { db } from "./db";
import { oiRcaRecords } from "@shared/schema";
import { eq } from "drizzle-orm";

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

export async function validateTransition(
  issue: OiIssue,
  to: string,
  actorRole: string,
  reason?: string
): Promise<void> {
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

  // Phase 1C: Block → closed when rca_required = TRUE and no approved RCA exists
  if (to === "closed" && issue.rcaRequired) {
    const [rca] = await db
      .select({ status: oiRcaRecords.status })
      .from(oiRcaRecords)
      .where(eq(oiRcaRecords.issueId, issue.id))
      .limit(1);
    if (!rca || rca.status !== "approved") {
      throw new TransitionError("rca_approval_required_for_closure", 422);
    }
  }
}

export function getAllowedTransitions(issue: OiIssue, actorRole: string): string[] {
  const allowed = PHASE_1A_TRANSITIONS[issue.status] ?? [];
  // Note: closure RCA check is async — caller filters sync-only; rca_required closure
  // block is enforced at transition time, not pre-computed here.
  return allowed.filter(to => {
    const key = `${issue.status}->${to}`;
    const permitted = ROLE_TRANSITION_MAP[key] ?? [];
    if (!permitted.includes(actorRole)) return false;
    if (to === "verified" && (issue.severity === "S1" || issue.severity === "S2")) return false;
    return true;
  });
}
