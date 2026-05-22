export const CAPA_STATUS_LABELS: Record<string, string> = {
  draft:                  "Draft",
  open:                   "Open",
  in_progress:            "In Progress",
  pending_verification:   "Pending Verification",
  effectiveness_review:   "Effectiveness Review",
  closed:                 "Closed",
  cancelled:              "Cancelled",
};

export const CAPA_STATUS_COLORS: Record<string, string> = {
  draft:                  "bg-gray-100 text-gray-700",
  open:                   "bg-blue-100 text-blue-800",
  in_progress:            "bg-yellow-100 text-yellow-800",
  pending_verification:   "bg-orange-100 text-orange-800",
  effectiveness_review:   "bg-purple-100 text-purple-800",
  closed:                 "bg-green-100 text-green-800",
  cancelled:              "bg-red-100 text-red-700",
};

export const CAPA_PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high:     "High",
  medium:   "Medium",
  low:      "Low",
};

export const CAPA_PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border border-red-300",
  high:     "bg-orange-100 text-orange-800 border border-orange-300",
  medium:   "bg-yellow-100 text-yellow-800 border border-yellow-300",
  low:      "bg-gray-100 text-gray-700",
};

export const CAPA_TYPE_LABELS: Record<string, string> = {
  corrective:  "Corrective",
  preventive:  "Preventive",
  combined:    "Combined",
};

export const CAPA_TYPE_COLORS: Record<string, string> = {
  corrective: "bg-red-50 text-red-700",
  preventive: "bg-blue-50 text-blue-700",
  combined:   "bg-purple-50 text-purple-700",
};

export const ACTION_STATUS_LABELS: Record<string, string> = {
  open:      "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ACTION_VERIFICATION_LABELS: Record<string, string> = {
  pending:  "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

export const ACTION_STATUS_COLORS: Record<string, string> = {
  open:      "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export const ACTION_VERIFICATION_COLORS: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  verified: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export const EFFECTIVENESS_SCORE_LABELS: Record<number, string> = {
  1: "Completely Ineffective",
  2: "Marginally Effective",
  3: "Partially Effective",
  4: "Mostly Effective",
  5: "Fully Effective",
};

export const CAPA_STATUSES = Object.keys(CAPA_STATUS_LABELS) as string[];
export const CAPA_PRIORITIES = ['critical','high','medium','low'] as const;
export const CAPA_TYPES = ['corrective','preventive','combined'] as const;

export const CAPA_TRANSITION_LABELS: Record<string, string> = {
  open:   "Open CAPA",
  start:  "Mark In Progress",
  submit: "Submit for Verification",
  verify: "Move to Effectiveness Review",
  close:  "Close CAPA",
  cancel: "Cancel CAPA",
  reopen: "Reopen CAPA",
};

// Ordered status pipeline for display
export const CAPA_STATUS_PIPELINE = [
  'draft','open','in_progress','pending_verification','effectiveness_review','closed'
] as const;
