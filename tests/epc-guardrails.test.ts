import { describe, it, expect } from 'vitest';
import {
  validateProjectCode,
  validateChildDocNumber,
  validateGcsPath,
  assertProjectCode,
  assertChildDocNumber,
  assertGcsPath,
} from '../server/epc-guardrails';

function buildEpcGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  projectSeq: string,
  docType: string,
  documentNumber: string,
  revisionCode: string | null,
  attachmentSeq: number,
  attachmentLabel: string,
  originalFileName: string
): string {
  const revSlot = revisionCode ? `rev-${revisionCode}` : 'rev-na';
  const seq = String(attachmentSeq).padStart(3, '0');
  const label = attachmentLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';
  const ext = originalFileName.split('.').pop()?.toLowerCase() || 'bin';
  return `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/${docType}/${documentNumber}/${revSlot}/${seq}-${label}.${ext}`;
}

describe('Project Code Generation', () => {
  it('accepts valid {FY}-{NNN} codes', () => {
    expect(validateProjectCode('2425-001').valid).toBe(true);
    expect(validateProjectCode('2526-010').valid).toBe(true);
    expect(validateProjectCode('2627-999').valid).toBe(true);
    expect(validateProjectCode('9900-001').valid).toBe(true);
  });

  it('rejects legacy TP- prefixed codes', () => {
    const r = validateProjectCode('TP-OC-NZ-WPC-2425-001');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Legacy TP- prefix');
  });

  it('rejects codes with wrong FY sequence', () => {
    const r = validateProjectCode('2427-001');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid FY code');
  });

  it('rejects codes with wrong digit width', () => {
    expect(validateProjectCode('2425-01').valid).toBe(false);
    expect(validateProjectCode('2425-0001').valid).toBe(false);
    expect(validateProjectCode('242-001').valid).toBe(false);
  });

  it('rejects empty and garbage input', () => {
    expect(validateProjectCode('').valid).toBe(false);
    expect(validateProjectCode('abc').valid).toBe(false);
    expect(validateProjectCode('PROJECT-001').valid).toBe(false);
  });

  it('assertProjectCode throws on invalid', () => {
    expect(() => assertProjectCode('TP-OC-NZ-WPC-2425-001')).toThrow('EPC Guardrail Violation');
    expect(() => assertProjectCode('2425-001')).not.toThrow();
  });
});

describe('WO/PO Numbering', () => {
  it('accepts valid WO numbers', () => {
    expect(validateChildDocNumber('2425-001-WO-0001').valid).toBe(true);
    expect(validateChildDocNumber('2627-999-WO-9999').valid).toBe(true);
  });

  it('accepts valid PO numbers', () => {
    expect(validateChildDocNumber('2526-002-PO-0001').valid).toBe(true);
  });

  it('accepts valid DWG numbers', () => {
    expect(validateChildDocNumber('2425-001-DWG-0001').valid).toBe(true);
  });

  it('accepts valid BOM numbers', () => {
    expect(validateChildDocNumber('2526-003-BOM-0042').valid).toBe(true);
  });

  it('accepts all registered doc types', () => {
    const types = ['WO', 'PO', 'DWG', 'BOM', 'PLN', 'BUY', 'MFG', 'QPL', 'POP', 'WOP', 'INS', 'DR', 'DSP', 'CR', 'BR', 'INV', 'NCR', 'ECR', 'ECN'];
    for (const t of types) {
      expect(validateChildDocNumber(`2627-001-${t}-0001`).valid).toBe(true);
    }
  });

  it('rejects old WO-{code}-{n} format', () => {
    const r = validateChildDocNumber('WO-TP-OC-NZ-WPC-2425-001-1');
    expect(r.valid).toBe(false);
  });

  it('rejects 3-digit child sequences', () => {
    expect(validateChildDocNumber('2425-001-WO-001').valid).toBe(false);
  });

  it('rejects 5-digit child sequences', () => {
    expect(validateChildDocNumber('2425-001-WO-00001').valid).toBe(false);
  });

  it('rejects missing project code prefix', () => {
    expect(validateChildDocNumber('WO-0001').valid).toBe(false);
  });

  it('assertChildDocNumber throws on invalid', () => {
    expect(() => assertChildDocNumber('WO-PROJECT-1')).toThrow('EPC Guardrail Violation');
    expect(() => assertChildDocNumber('2627-001-WO-0001')).not.toThrow();
  });
});

describe('GCS Path Builder', () => {
  it('builds correct TPEL path', () => {
    const path = buildEpcGcsPath('SA', 'BR', 'LWA', '2627', '001', 'DWG', '2627-001-DWG-0001', 'A', 1, 'drawing', 'plan.pdf');
    expect(path).toBe('TPEL/SA/BR/LWA/2627/001/DWG/2627-001-DWG-0001/rev-A/001-drawing.pdf');
  });

  it('uses fy_code and project_seq as separate path segments', () => {
    const path = buildEpcGcsPath('EU', 'DE', 'AVI', '2526', '002', 'BOM', '2526-002-BOM-0001', null, 1, 'bom-sheet', 'data.xlsx');
    expect(path).toBe('TPEL/EU/DE/AVI/2526/002/BOM/2526-002-BOM-0001/rev-na/001-bom-sheet.xlsx');
    const segments = path.split('/');
    expect(segments[4]).toBe('2526');
    expect(segments[5]).toBe('002');
  });

  it('never concatenates FY-NNN in path segments', () => {
    const path = buildEpcGcsPath('OC', 'NZ', 'WPC', '2425', '001', 'INS', '2425-001-INS-0001', 'A', 1, 'report', 'file.pdf');
    const pathParts = path.split('/');
    expect(pathParts[0]).toBe('TPEL');
    expect(pathParts[1]).toBe('OC');
    expect(pathParts[2]).toBe('NZ');
    expect(pathParts[3]).toBe('WPC');
    expect(pathParts[4]).toBe('2425');
    expect(pathParts[5]).toBe('001');
  });

  it('sanitizes labels correctly', () => {
    const path = buildEpcGcsPath('SA', 'BR', 'LWA', '2627', '001', 'WO', '2627-001-WO-0001', null, 1, 'My Work Order!@#', 'doc.pdf');
    expect(path).toContain('001-my-work-order.pdf');
  });

  it('handles null revision code with rev-na', () => {
    const path = buildEpcGcsPath('SA', 'BR', 'LWA', '2627', '001', 'WO', '2627-001-WO-0001', null, 1, 'doc', 'file.pdf');
    expect(path).toContain('/rev-na/');
  });

  it('handles explicit revision code', () => {
    const path = buildEpcGcsPath('SA', 'BR', 'LWA', '2627', '001', 'DWG', '2627-001-DWG-0001', 'B', 1, 'drawing', 'plan.dwg');
    expect(path).toContain('/rev-B/');
  });
});

describe('GCS Path Validation', () => {
  it('accepts valid TPEL paths', () => {
    expect(validateGcsPath('TPEL/SA/BR/LWA/2627/001/DWG/2627-001-DWG-0001/rev-A/001-drawing.pdf').valid).toBe(true);
    expect(validateGcsPath('TPEL/EU/DE/AVI/2526/002/BOM/2526-002-BOM-0001/rev-na/001-bom.xlsx').valid).toBe(true);
  });

  it('rejects legacy EPC/ paths', () => {
    const r = validateGcsPath('EPC/TP-OC-NZ-WPC-2425-001/DWG/drawing.pdf');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Legacy GCS path prefix');
  });

  it('rejects legacy THERMOPAC_PROJECTS/ paths', () => {
    const r = validateGcsPath('THERMOPAC_PROJECTS/2425/project/Dispatch/file.pdf');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Legacy GCS path prefix');
  });

  it('rejects paths containing operational_code', () => {
    const r = validateGcsPath('TPEL/SA/BR/LWA/2627/operational_code/DWG/file.pdf');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('operational_code');
  });

  it('allows quotation paths (pre-conversion)', () => {
    expect(validateGcsPath('TPEL/SA/BR/LWA/2627/Quotations/OFF-001/rev-01/001-quotation.pdf').valid).toBe(true);
  });

  it('assertGcsPath throws on invalid', () => {
    expect(() => assertGcsPath('EPC/old-path/file.pdf')).toThrow('EPC Guardrail Violation');
    expect(() => assertGcsPath('TPEL/SA/BR/LWA/2627/001/DWG/doc/rev-A/001-file.pdf')).not.toThrow();
  });
});
