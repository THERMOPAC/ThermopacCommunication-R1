export const ROOT_CAUSE_CODES = [
  'DESIGN_ERROR','MANUFACTURING_DEFECT','MATERIAL_FAILURE','PROCESS_DEVIATION',
  'HUMAN_ERROR','EQUIPMENT_FAILURE','SUPPLIER_QUALITY','SPECIFICATION_GAP',
  'COMMUNICATION_FAILURE','ENVIRONMENTAL_FACTOR','SYSTEMIC_WEAKNESS',
  'INSPECTION_FAILURE','MAINTENANCE_FAILURE','SOFTWARE_ERROR','UNKNOWN',
] as const;

export type RootCauseCode = typeof ROOT_CAUSE_CODES[number];

export const ROOT_CAUSE_LABELS: Record<RootCauseCode, string> = {
  DESIGN_ERROR:           'Design Error',
  MANUFACTURING_DEFECT:   'Manufacturing Defect',
  MATERIAL_FAILURE:       'Material Failure',
  PROCESS_DEVIATION:      'Process Deviation',
  HUMAN_ERROR:            'Human Error',
  EQUIPMENT_FAILURE:      'Equipment Failure',
  SUPPLIER_QUALITY:       'Supplier Quality',
  SPECIFICATION_GAP:      'Specification Gap',
  COMMUNICATION_FAILURE:  'Communication Failure',
  ENVIRONMENTAL_FACTOR:   'Environmental Factor',
  SYSTEMIC_WEAKNESS:      'Systemic Weakness',
  INSPECTION_FAILURE:     'Inspection Failure',
  MAINTENANCE_FAILURE:    'Maintenance Failure',
  SOFTWARE_ERROR:         'Software / Configuration Error',
  UNKNOWN:                'Unknown',
};

export const METHODOLOGY_LABELS: Record<string, string> = {
  five_why:     '5 Why',
  fishbone:     'Fishbone (Ishikawa)',
  failure_tree: 'Failure Tree',
  combined:     'Combined',
};

export const FISHBONE_CATEGORY_LABELS: Record<string, string> = {
  man:         'People / Human Factors',
  machine:     'Equipment / Machine',
  material:    'Materials / Parts',
  method:      'Process / Method',
  measurement: 'Measurement / Data',
  environment: 'Environment',
};

export const FAILURE_TREE_NODE_TYPE_LABELS: Record<string, string> = {
  top_event:          'Top Event',
  intermediate_event: 'Intermediate Event',
  basic_event:        'Basic Event',
  and_gate:           'AND Gate',
  or_gate:            'OR Gate',
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  same_root_cause: 'Same Root Cause',
  related_cause:   'Related Cause',
  recurrence:      'Recurrence',
  pattern:         'Failure Pattern',
};

export const RCA_STATUS_LABELS: Record<string, string> = {
  draft:        'Draft',
  submitted:    'Submitted',
  under_review: 'Under Review',
  approved:     'Approved',
  rejected:     'Rejected',
};

export const RCA_STATUS_COLORS: Record<string, string> = {
  draft:        'bg-gray-100 text-gray-700',
  submitted:    'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
};
