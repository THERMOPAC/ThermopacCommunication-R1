export const CONTROL_TYPE_LABELS: Record<string, string> = {
  hold_point:                            "Hold Point",
  qc_hold:                               "QC Hold",
  dispatch_hold:                         "Dispatch Hold",
  procurement_hold:                      "Procurement Hold",
  drawing_gate:                          "Drawing Gate",
  dvs_gate:                              "DVS Gate",
  fat_block:                             "FAT Block",
  sat_block:                             "SAT Block",
  commissioning_block:                   "Commissioning Block",
  dvs_revision_mismatch:                 "DVS Revision Mismatch",
  dvs_unverified_drawing:                "DVS Unverified Drawing",
  dvs_missing_custom_property:           "DVS Missing Custom Property",
  procurement_blocked_vendor:            "Procurement Blocked Vendor",
  procurement_missing_tbe_cbe:           "Procurement Missing TBE/CBE",
  procurement_missing_qc_requirement:    "Procurement Missing QC Requirement",
  procurement_expired_vendor_qualification: "Procurement Expired Vendor Qualification",
};

export const ERP_ENTITY_TYPE_LABELS: Record<string, string> = {
  epc_purchase_order:           "EPC Purchase Order",
  epc_work_order:               "EPC Work Order",
  epc_dispatch_readiness:       "EPC Dispatch Readiness",
  epc_commissioning_readiness:  "EPC Commissioning Readiness",
  inspection_execution:         "Inspection Execution",
  epc_drawing_verification:     "EPC Drawing Verification",
  purchase_order:               "Purchase Order",
  work_order:                   "Work Order",
};

export const ENFORCEMENT_LEVEL_LABELS: Record<string, string> = {
  advisory:  "Advisory",
  mandatory: "Mandatory",
};

export const ENFORCEMENT_SCOPE_LABELS: Record<string, string> = {
  global:         "Global",
  department:     "Department",
  project:        "Project",
  equipment_type: "Equipment Type",
};

export const CONTROL_STATUS_LABELS: Record<string, string> = {
  draft:     "Draft",
  active:    "Active",
  suspended: "Suspended",
  retired:   "Retired",
};

export const HOLD_STATUS_LABELS: Record<string, string> = {
  open:                "Open",
  approved_to_proceed: "Approved to Proceed",
  released:            "Released",
  overridden:          "Overridden",
  emergency_bypassed:  "Emergency Bypassed",
};

export const RESPONSE_STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  submitted: "Submitted",
  rejected:  "Rejected",
};

export const CONTROL_STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700",
  active:    "bg-green-100 text-green-800",
  suspended: "bg-yellow-100 text-yellow-800",
  retired:   "bg-red-100 text-red-700",
};

export const HOLD_STATUS_COLORS: Record<string, string> = {
  open:                "bg-red-100 text-red-800",
  approved_to_proceed: "bg-blue-100 text-blue-800",
  released:            "bg-green-100 text-green-800",
  overridden:          "bg-orange-100 text-orange-800",
  emergency_bypassed:  "bg-purple-100 text-purple-800",
};

export const ENFORCEMENT_LEVEL_COLORS: Record<string, string> = {
  advisory:  "bg-sky-100 text-sky-800",
  mandatory: "bg-red-100 text-red-800",
};

export const ERP_ENTITY_TYPES = Object.keys(ERP_ENTITY_TYPE_LABELS);
export const CONTROL_TYPES    = Object.keys(CONTROL_TYPE_LABELS);
