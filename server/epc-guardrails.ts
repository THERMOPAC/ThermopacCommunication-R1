const PROJECT_CODE_RE = /^\d{4}-\d{3}$/;
const CHILD_DOC_RE = /^\d{4}-\d{3}-[A-Z]{2,4}-\d{4}$/;
const GCS_PATH_RE = /^TPEL\/[A-Z]{2}\/[A-Z]{2}\/[A-Z0-9]{3,5}\/\d{4}\/\d{3}\//;
const LEGACY_TP_PREFIX_RE = /^TP-/;

export function validateProjectCode(code: string): { valid: boolean; error?: string } {
  if (LEGACY_TP_PREFIX_RE.test(code)) {
    return { valid: false, error: `Legacy TP- prefix detected: "${code}". Project codes must use {FY}-{NNN} format.` };
  }
  if (!PROJECT_CODE_RE.test(code)) {
    return { valid: false, error: `Invalid project code format: "${code}". Must match {FY}-{NNN} (e.g., 2627-001).` };
  }
  const fyCode = code.substring(0, 4);
  const yy = parseInt(fyCode.substring(0, 2), 10);
  const zz = parseInt(fyCode.substring(2, 4), 10);
  if ((yy + 1) % 100 !== zz) {
    return { valid: false, error: `Invalid FY code in project code: "${code}". YY+1 must equal ZZ (e.g., 2526, 2627).` };
  }
  return { valid: true };
}

export function validateChildDocNumber(docNumber: string): { valid: boolean; error?: string } {
  if (!CHILD_DOC_RE.test(docNumber)) {
    return { valid: false, error: `Invalid child doc number: "${docNumber}". Must match {FY}-{NNN}-{TYPE}-{NNNN} (e.g., 2627-001-WO-0001).` };
  }
  const projectCode = docNumber.substring(0, 8);
  const pcResult = validateProjectCode(projectCode);
  if (!pcResult.valid) {
    return { valid: false, error: `Invalid project code prefix in doc number: ${pcResult.error}` };
  }
  return { valid: true };
}

export function validateGcsPath(path: string): { valid: boolean; error?: string } {
  if (path.includes('operational_code') || path.includes('operationalCode')) {
    return { valid: false, error: `GCS path must not reference operational_code: "${path}"` };
  }
  if (path.startsWith('EPC/') || path.startsWith('THERMOPAC_PROJECTS/')) {
    return { valid: false, error: `Legacy GCS path prefix detected: "${path}". Must use TPEL/ prefix.` };
  }
  if (path.startsWith('TPEL/') && !GCS_PATH_RE.test(path)) {
    if (!path.startsWith('TPEL/') || path.includes('/Quotations/')) {
      return { valid: true };
    }
    return { valid: false, error: `GCS path does not match TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/... pattern: "${path}"` };
  }
  return { valid: true };
}

export function assertProjectCode(code: string): void {
  const result = validateProjectCode(code);
  if (!result.valid) {
    throw new Error(`EPC Guardrail Violation: ${result.error}`);
  }
}

export function assertChildDocNumber(docNumber: string): void {
  const result = validateChildDocNumber(docNumber);
  if (!result.valid) {
    throw new Error(`EPC Guardrail Violation: ${result.error}`);
  }
}

export function assertGcsPath(path: string): void {
  const result = validateGcsPath(path);
  if (!result.valid) {
    throw new Error(`EPC Guardrail Violation: ${result.error}`);
  }
}

export function rejectCodeParsing(code: string, context: string): void {
  if (code.includes('-') && code.split('-').length > 2) {
    throw new Error(
      `EPC Guardrail Violation: Do not parse project code "${code}" to derive FY or sequence. ` +
      `Use project.fyCode and project.projectSeq fields directly. Context: ${context}`
    );
  }
}
