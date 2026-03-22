export type QcDataValue = "Y" | "F" | "N";

export type QcGroupName = "supply" | "logistics" | "qc";

export interface QcDropdownOption {
  dataValue: QcDataValue;
  displayValue: string;
}

export interface QcFieldConfig {
  label: string;
  udfName: string;
  fieldType: "dropdown";
  groupName: QcGroupName;
  values: QcDropdownOption[];
  allowNull: boolean;
  defaultDataValue: QcDataValue | null;
  sortOrder: number;
  isActive: boolean;
}

export interface QcValidationError {
  field: string;
  message: string;
}

export interface QcValidationResult {
  isValid: boolean;
  errorType?: string;
  message?: string;
  errors: QcValidationError[];
}

const GRPO_QC_CHECKLIST_CONFIG: QcFieldConfig[] = [
  {
    label: "Short Supply",
    udfName: "U_Short_Supply",
    fieldType: "dropdown",
    groupName: "supply",
    values: [
      { dataValue: "Y", displayValue: "Complete Supply" },
      { dataValue: "F", displayValue: "Short Supply" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 1,
    isActive: true,
  },
  {
    label: "Timely Delivery",
    udfName: "U_Timely_Delivery",
    fieldType: "dropdown",
    groupName: "logistics",
    values: [
      { dataValue: "Y", displayValue: "On Time" },
      { dataValue: "F", displayValue: "Delayed Delivery" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 2,
    isActive: true,
  },
  {
    label: "Visual Accepted",
    udfName: "U_Visual_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 3,
    isActive: true,
  },
  {
    label: "Mfg TC Accepted",
    udfName: "U_Mfg_TC_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Required" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 4,
    isActive: true,
  },
  {
    label: "Lab TC Accepted",
    udfName: "U_Lab_TC_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Required" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 5,
    isActive: true,
  },
  {
    label: "NDT Accepted",
    udfName: "U_NDT_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 6,
    isActive: true,
  },
  {
    label: "RT Accepted",
    udfName: "U_RT_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 7,
    isActive: true,
  },
  {
    label: "Hydro Accepted",
    udfName: "U_Hydro_Pneu_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 8,
    isActive: true,
  },
  {
    label: "UT Accepted",
    udfName: "U_UT_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 9,
    isActive: true,
  },
  {
    label: "MT Accepted",
    udfName: "U_MT_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 10,
    isActive: true,
  },
  {
    label: "PMI Accepted",
    udfName: "U_Painting_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
      { dataValue: "N", displayValue: "Not Applicable" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 11,
    isActive: true,
  },
  {
    label: "Dimensional Accepted",
    udfName: "U_Dimensional_Accepted",
    fieldType: "dropdown",
    groupName: "qc",
    values: [
      { dataValue: "Y", displayValue: "Yes" },
      { dataValue: "F", displayValue: "No" },
    ],
    allowNull: false,
    defaultDataValue: "F",
    sortOrder: 12,
    isActive: true,
  },
];

export function getGrpoQcChecklistConfig(): QcFieldConfig[] {
  return GRPO_QC_CHECKLIST_CONFIG
    .filter(f => f.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getDisplayValue(udfName: string, dataValue: string): string | null {
  const field = GRPO_QC_CHECKLIST_CONFIG.find(f => f.udfName === udfName);
  if (!field) return null;
  const option = field.values.find(v => v.dataValue === dataValue);
  return option?.displayValue ?? null;
}

export function getDataValue(udfName: string, displayValue: string): string | null {
  const field = GRPO_QC_CHECKLIST_CONFIG.find(f => f.udfName === udfName);
  if (!field) return null;
  const option = field.values.find(v => v.displayValue === displayValue);
  return option?.dataValue ?? null;
}

export function getDefaultQcPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of GRPO_QC_CHECKLIST_CONFIG.filter(f => f.isActive)) {
    if (field.defaultDataValue) {
      payload[field.udfName] = field.defaultDataValue;
    }
  }
  return payload;
}

export function validateGrpoQcPayload(payload: Record<string, unknown>): QcValidationResult {
  const errors: QcValidationError[] = [];
  const activeFields = GRPO_QC_CHECKLIST_CONFIG.filter(f => f.isActive);

  for (const field of activeFields) {
    const value = payload[field.udfName];

    if (value === undefined || value === null || value === "") {
      errors.push({
        field: field.udfName,
        message: `${field.label} is required.`,
      });
      continue;
    }

    const allowedValues = field.values.map(v => v.dataValue);
    if (!allowedValues.includes(value as QcDataValue)) {
      errors.push({
        field: field.udfName,
        message: `Invalid value '${value}'. Allowed values are: ${allowedValues.join(", ")}.`,
      });
      continue;
    }

    if (value === "F") {
      const displayLabel = field.values.find(v => v.dataValue === "F")?.displayValue || "Rejected";
      errors.push({
        field: field.udfName,
        message: `Default value '${displayLabel}' not allowed. Please confirm QC result.`,
      });
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errorType: "QC_VALIDATION_FAILED",
      errors,
    };
  }

  return {
    isValid: true,
    message: "QC Checklist fully completed",
    errors: [],
  };
}

export function getFieldsByGroup(groupName: QcGroupName): QcFieldConfig[] {
  return GRPO_QC_CHECKLIST_CONFIG
    .filter(f => f.isActive && f.groupName === groupName)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
