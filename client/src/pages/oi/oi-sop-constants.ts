export const SOP_STATUS_LABELS: Record<string, string> = {
  draft:        "Draft",
  under_review: "Under Review",
  approved:     "Approved",
  active:       "Active",
  retired:      "Retired",
};

export const SOP_STATUS_COLORS: Record<string, string> = {
  draft:        "bg-gray-100 text-gray-700",
  under_review: "bg-yellow-100 text-yellow-800",
  approved:     "bg-blue-100 text-blue-800",
  active:       "bg-green-100 text-green-800",
  retired:      "bg-red-100 text-red-700",
};

export const SOP_TYPE_LABELS: Record<string, string> = {
  procedure:        "Procedure",
  work_instruction: "Work Instruction",
  policy:           "Policy",
  guideline:        "Guideline",
  checklist:        "Checklist",
};

export const SOP_TYPE_COLORS: Record<string, string> = {
  procedure:        "bg-blue-50 text-blue-700",
  work_instruction: "bg-purple-50 text-purple-700",
  policy:           "bg-orange-50 text-orange-700",
  guideline:        "bg-teal-50 text-teal-700",
  checklist:        "bg-gray-50 text-gray-700",
};

export const SOP_REVISION_STATUS_LABELS: Record<string, string> = {
  draft:        "Draft",
  under_review: "Under Review",
  approved:     "Approved",
  rejected:     "Rejected",
};

export const SOP_REVISION_STATUS_COLORS: Record<string, string> = {
  draft:        "bg-gray-100 text-gray-700",
  under_review: "bg-yellow-100 text-yellow-800",
  approved:     "bg-green-100 text-green-800",
  rejected:     "bg-red-100 text-red-700",
};

export const EFFECTIVENESS_SCORE_LABELS: Record<number, string> = {
  1: "Completely Ineffective",
  2: "Marginally Effective",
  3: "Partially Effective",
  4: "Mostly Effective",
  5: "Fully Effective",
};

export const EFFECTIVENESS_SCORE_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-800",
  2: "bg-orange-100 text-orange-800",
  3: "bg-yellow-100 text-yellow-800",
  4: "bg-blue-100 text-blue-800",
  5: "bg-green-100 text-green-800",
};

export const LINKED_TYPE_LABELS: Record<string, string> = {
  issue: "Issue",
  rca:   "RCA",
  capa:  "CAPA",
};

export const SOP_TYPES = [
  "procedure",
  "work_instruction",
  "policy",
  "guideline",
  "checklist",
] as const;

export const SOP_STATUSES = [
  "draft",
  "under_review",
  "approved",
  "active",
  "retired",
] as const;

export const SOP_STATUS_PIPELINE = [
  "draft",
  "under_review",
  "approved",
  "active",
] as const;

export const SOP_TRANSITION_LABELS: Record<string, string> = {
  submit:   "Submit for Review",
  approve:  "Approve SOP",
  reject:   "Reject",
  activate: "Activate SOP",
  retire:   "Retire SOP",
};
