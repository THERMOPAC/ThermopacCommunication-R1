export const LESSON_STATUSES = ["draft","submitted_for_review","under_review","approved","published","archived"] as const;
export type LessonStatus = typeof LESSON_STATUSES[number];

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  draft:                "Draft",
  submitted_for_review: "Submitted for Review",
  under_review:         "Under Review",
  approved:             "Approved",
  published:            "Published",
  archived:             "Archived",
};

export const LESSON_STATUS_COLORS: Record<LessonStatus, string> = {
  draft:                "bg-slate-100 text-slate-700",
  submitted_for_review: "bg-blue-100 text-blue-700",
  under_review:         "bg-amber-100 text-amber-700",
  approved:             "bg-green-100 text-green-700",
  published:            "bg-emerald-100 text-emerald-700",
  archived:             "bg-gray-100 text-gray-500",
};

export const LESSON_CATEGORIES = [
  "design_deficiency","procurement_quality","execution_process",
  "testing_commissioning","documentation_control","communication_coordination",
  "vendor_management","planning_scheduling","safety_compliance","technical_deviation",
] as const;
export type LessonCategory = typeof LESSON_CATEGORIES[number];

export const LESSON_CATEGORY_LABELS: Record<LessonCategory, string> = {
  design_deficiency:         "Design Deficiency",
  procurement_quality:       "Procurement Quality",
  execution_process:         "Execution Process",
  testing_commissioning:     "Testing & Commissioning",
  documentation_control:     "Documentation Control",
  communication_coordination:"Communication & Coordination",
  vendor_management:         "Vendor Management",
  planning_scheduling:       "Planning & Scheduling",
  safety_compliance:         "Safety & Compliance",
  technical_deviation:       "Technical Deviation",
};

export const LESSON_CATEGORY_COLORS: Record<LessonCategory, string> = {
  design_deficiency:         "bg-red-100 text-red-700",
  procurement_quality:       "bg-orange-100 text-orange-700",
  execution_process:         "bg-amber-100 text-amber-700",
  testing_commissioning:     "bg-yellow-100 text-yellow-700",
  documentation_control:     "bg-lime-100 text-lime-700",
  communication_coordination:"bg-green-100 text-green-700",
  vendor_management:         "bg-teal-100 text-teal-700",
  planning_scheduling:       "bg-cyan-100 text-cyan-700",
  safety_compliance:         "bg-blue-100 text-blue-700",
  technical_deviation:       "bg-purple-100 text-purple-700",
};

export const LESSON_TYPES = ["preventive","corrective","best_practice","observation"] as const;
export type LessonType = typeof LESSON_TYPES[number];

export const LESSON_TYPE_LABELS: Record<LessonType, string> = {
  preventive:    "Preventive",
  corrective:    "Corrective",
  best_practice: "Best Practice",
  observation:   "Observation",
};

export const LESSON_SCOPES = ["global","department","project","equipment_type"] as const;
export type LessonScope = typeof LESSON_SCOPES[number];

export const LESSON_SCOPE_LABELS: Record<LessonScope, string> = {
  global:         "Global",
  department:     "Department",
  project:        "Project",
  equipment_type: "Equipment Type",
};

export const LESSON_PRIORITIES = ["low","normal","high","critical"] as const;
export type LessonPriority = typeof LESSON_PRIORITIES[number];

export const LESSON_PRIORITY_COLORS: Record<LessonPriority, string> = {
  low:      "bg-slate-100 text-slate-600",
  normal:   "bg-blue-100 text-blue-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export const LESSON_PRIORITY_LABELS: Record<LessonPriority, string> = {
  low:      "Low",
  normal:   "Normal",
  high:     "High",
  critical: "Critical",
};

export const LESSON_REC_RISKS = ["low","medium","high"] as const;
export type LessonRecRisk = typeof LESSON_REC_RISKS[number];

export const LESSON_REC_RISK_LABELS: Record<LessonRecRisk, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
};

export const EFFECTIVENESS_RATINGS = ["highly_effective","effective","partially_effective","not_effective"] as const;
export type EffectivenessRating = typeof EFFECTIVENESS_RATINGS[number];

export const EFFECTIVENESS_RATING_LABELS: Record<EffectivenessRating, string> = {
  highly_effective:    "Highly Effective",
  effective:           "Effective",
  partially_effective: "Partially Effective",
  not_effective:       "Not Effective",
};

export const EFFECTIVENESS_RATING_COLORS: Record<EffectivenessRating, string> = {
  highly_effective:    "bg-emerald-100 text-emerald-700",
  effective:           "bg-green-100 text-green-700",
  partially_effective: "bg-amber-100 text-amber-700",
  not_effective:       "bg-red-100 text-red-700",
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  issue:               "Issue",
  rca:                 "RCA",
  capa:                "CAPA",
  sop:                 "SOP",
  enforcement_control: "Enforcement Control",
  enforcement_hold:    "Enforcement Hold",
};

export const REVIEWER_STATUS_LABELS: Record<string, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
  recused:  "Recused",
};

export const REVIEWER_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  recused:  "bg-gray-100 text-gray-500",
};

export const OI_DEPARTMENTS = [
  "Accounts","Administration","After Sales","Design",
  "Engineering","Marketing","Production","Projects",
  "Purchase","Quality Control","Stores",
];
