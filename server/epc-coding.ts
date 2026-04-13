import { db } from './db';
import { sql } from 'drizzle-orm';

export const CONTINENT_CODES: Record<string, string> = {
  'AF': 'Africa',
  'AS': 'Asia',
  'EU': 'Europe',
  'NA': 'North America',
  'SA': 'South America',
  'OC': 'Oceania',
};

export const COUNTRY_CODES: Record<string, string> = {
  'AE': 'United Arab Emirates', 'AR': 'Argentina', 'AU': 'Australia', 'AZ': 'Azerbaijan',
  'BG': 'Bulgaria', 'BH': 'Bahrain', 'BR': 'Brazil', 'DE': 'Germany', 'DZ': 'Algeria',
  'EC': 'Ecuador', 'ET': 'Ethiopia', 'GB': 'United Kingdom', 'GN': 'Guinea', 'IN': 'India',
  'KW': 'Kuwait', 'MX': 'Mexico', 'NG': 'Nigeria', 'NZ': 'New Zealand', 'PA': 'Panama',
  'PL': 'Poland', 'QA': 'Qatar', 'SA': 'Saudi Arabia', 'SD': 'Sudan', 'TR': 'Turkey',
  'TT': 'Trinidad & Tobago', 'US': 'United States', 'CA': 'Canada', 'FR': 'France',
  'IT': 'Italy', 'ES': 'Spain', 'CN': 'China', 'JP': 'Japan', 'KR': 'South Korea',
  'SG': 'Singapore', 'MY': 'Malaysia', 'TH': 'Thailand', 'ID': 'Indonesia', 'PH': 'Philippines',
  'VN': 'Vietnam', 'ZA': 'South Africa', 'KE': 'Kenya', 'GH': 'Ghana', 'TZ': 'Tanzania',
  'EG': 'Egypt', 'MA': 'Morocco', 'TN': 'Tunisia', 'LY': 'Libya', 'OM': 'Oman',
  'YE': 'Yemen', 'JO': 'Jordan', 'LB': 'Lebanon', 'IQ': 'Iraq', 'IR': 'Iran',
  'PK': 'Pakistan', 'BD': 'Bangladesh', 'LK': 'Sri Lanka', 'NP': 'Nepal', 'MM': 'Myanmar',
  'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru', 'VE': 'Venezuela', 'UY': 'Uruguay',
  'PY': 'Paraguay', 'BO': 'Bolivia', 'RO': 'Romania', 'HU': 'Hungary', 'CZ': 'Czech Republic',
  'SK': 'Slovakia', 'HR': 'Croatia', 'RS': 'Serbia', 'UA': 'Ukraine', 'BY': 'Belarus',
  'GE': 'Georgia', 'AM': 'Armenia', 'KZ': 'Kazakhstan', 'UZ': 'Uzbekistan',
};

export const DOC_TYPE_ABBR: Record<string, { table: string; column: string; label: string }> = {
  'PLN': { table: 'item_planning_records', column: 'planning_number', label: 'Planning Record' },
  'BUY': { table: 'procurement_execution_records', column: 'procurement_number', label: 'Procurement Execution' },
  'MFG': { table: 'production_execution_records', column: 'production_number', label: 'Production Execution' },
  'QPL': { table: 'quality_planning_records', column: 'quality_plan_number', label: 'Quality Plan' },
  'POP': { table: 'po_preparation_records', column: 'po_prep_number', label: 'PO Preparation' },
  'WOP': { table: 'wo_preparation_records', column: 'wo_prep_number', label: 'WO Preparation' },
  'DWG': { table: 'epc_drawing_controls', column: 'dwg_control_number', label: 'Drawing Control' },
  'BOM': { table: 'epc_bom_headers', column: 'bom_number', label: 'Bill of Materials' },
  'PO':  { table: 'epc_purchase_orders', column: 'po_number', label: 'Purchase Order' },
  'WO':  { table: 'epc_work_orders', column: 'wo_number', label: 'Work Order' },
  'INS': { table: 'inspection_execution_records', column: 'inspection_number', label: 'Inspection' },
  'DR':  { table: 'epc_dispatch_readiness', column: 'dr_number', label: 'Dispatch Readiness' },
  'DSP': { table: 'epc_dispatch_records', column: 'dispatch_number', label: 'Dispatch Record' },
  'CR':  { table: 'epc_commissioning_readiness', column: 'cr_number', label: 'Commissioning Readiness' },
  'BR':  { table: 'epc_billing_readiness', column: 'br_number', label: 'Billing Readiness' },
  'INV': { table: 'epc_invoices', column: 'invoice_number', label: 'Invoice' },
  'DO':  { table: 'epc_drawing_orders', column: 'do_number', label: 'Drawing Order' },
};

export function validateContinentCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && code in CONTINENT_CODES;
}

export function validateCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && code in COUNTRY_CODES;
}

export function validateShortCode(code: string): boolean {
  return /^[A-Z0-9]{3,5}$/.test(code);
}

export function validateFyCode(code: string): boolean {
  if (!/^\d{4}$/.test(code)) return false;
  const yy = parseInt(code.substring(0, 2), 10);
  const zz = parseInt(code.substring(2, 4), 10);
  return (yy + 1) % 100 === zz;
}

export function incrementRevisionCode(current: string): string {
  if (/^\d+$/.test(current)) {
    const num = parseInt(current, 10) + 1;
    return num.toString().padStart(2, '0');
  }
  if (current.length === 1) {
    if (current === 'Z') return 'AA';
    return String.fromCharCode(current.charCodeAt(0) + 1);
  }
  const last = current.charCodeAt(current.length - 1);
  if (last < 90) {
    return current.substring(0, current.length - 1) + String.fromCharCode(last + 1);
  }
  return current + 'A';
}

export async function generateOperationalCode(
  continentCode: string,
  countryCode: string,
  customerId: number,
  fyCode: string,
  tx: any
): Promise<{ projectCode: string; projectSeq: string }> {
  const { getNextProjectSeq } = await import('./doc-sequence-service');
  const { assertProjectCode } = await import('./epc-guardrails');
  const projectSeq = await getNextProjectSeq(fyCode, tx);
  const projectCode = `${fyCode}-${projectSeq}`;
  assertProjectCode(projectCode, 'epc-coding.generateOperationalCode');
  return { projectCode, projectSeq };
}

export function buildProjectItemCode(
  baseItemCode: string,
  fyCode: string,
  projectSeq: string
): string {
  return `${baseItemCode}-P${fyCode}-${projectSeq}`;
}

export async function generateCodeBars(
  bpCode: string,
  fyCode: string,
  projectSeq: string,
  client: any
): Promise<string> {
  const seqName = `codebars_seq_${fyCode}_${projectSeq}`;
  await client.query(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1 INCREMENT 1`);
  const result = await client.query(`SELECT nextval('${seqName}') AS seq`);
  const seq = String(result.rows[0].seq).padStart(3, '0');
  return `${bpCode}${fyCode}${projectSeq}${seq}`;
}

export async function generateDocumentNumber(
  projectId: number,
  docTypeAbbr: string,
  tx: any
): Promise<string> {
  const docType = DOC_TYPE_ABBR[docTypeAbbr];
  if (!docType) {
    throw new Error(`Unknown document type abbreviation: ${docTypeAbbr}`);
  }

  const projectResult = await tx.execute(
    sql`SELECT code FROM projects WHERE id = ${projectId}`
  );
  if (projectResult.rows.length === 0) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const projectCode = (projectResult.rows[0] as any).code;

  const { assertProjectCode, assertChildDocNumber } = await import('./epc-guardrails');
  assertProjectCode(projectCode, `epc-coding.generateDocumentNumber(${docTypeAbbr})`);

  const { getNextDocSeq } = await import('./doc-sequence-service');
  const seq = await getNextDocSeq(docTypeAbbr, projectId, tx);
  const docNumber = `${projectCode}-${docTypeAbbr}-${seq}`;
  assertChildDocNumber(docNumber, `epc-coding.generateDocumentNumber(${docTypeAbbr})`);
  return docNumber;
}

export const REVISION_CONTROLLED_TYPES = new Set(['DWG', 'BOM']);

export function buildEpcGcsPath(
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
  const path = `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/${docType}/${documentNumber}/${revSlot}/${seq}-${label}.${ext}`;
  const { assertGcsPath } = require('./epc-guardrails');
  assertGcsPath(path, 'epc-coding.buildEpcGcsPath');
  return path;
}

export async function resolveProjectGeoCodes(projectId: number, txOrDb?: any): Promise<{
  continentCode: string; countryCode: string; customerShortCode: string; fyCode: string; projectCode: string; projectSeq: string;
}> {
  const executor = txOrDb || db;
  const result = await executor.execute(
    sql`SELECT p.code, p.fy_code, p.project_seq,
               c.continent_code, c.country_code, c.short_code, c.continent, c.country_name
        FROM projects p
        JOIN customers c ON c.id = p.customer_id
        WHERE p.id = ${projectId}`
  );
  if (result.rows.length === 0) {
    throw new Error(`Project ${projectId} not found or has no customer`);
  }
  const row = result.rows[0] as any;
  let continentCode = row.continent_code;
  let countryCode = row.country_code;
  if (!continentCode && row.continent) {
    continentCode = CONTINENT_NAME_TO_CODE[row.continent];
  }
  if (!countryCode && row.country_name) {
    countryCode = COUNTRY_NAME_TO_CODE[row.country_name];
  }
  if (!continentCode || !countryCode || !row.short_code) {
    throw new Error(`Customer geography codes missing for project ${projectId}`);
  }
  return {
    continentCode,
    countryCode,
    customerShortCode: row.short_code,
    fyCode: row.fy_code,
    projectCode: row.code,
    projectSeq: row.project_seq,
  };
}

export const CONTINENT_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CONTINENT_CODES).map(([code, name]) => [name, code])
);

export const COUNTRY_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_CODES).map(([code, name]) => [name, code])
);

export function buildQuotationGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  offerNumber: string,
  revision: number,
  attachmentSeq: number,
  priceMode: string,
): string {
  const revSlot = `rev-${String(revision).padStart(2, '0')}`;
  const seq = String(attachmentSeq).padStart(3, '0');
  const labelMap: Record<string, string> = {
    'combined': 'combined-quotation',
    'with_tax': 'with-tax-quotation',
    'without_tax': 'budgetary-quotation',
  };
  const label = labelMap[priceMode] || priceMode.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const safeName = offerNumber.replace(/\//g, '-');
  return `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/Quotations/${safeName}/${revSlot}/${seq}-${label}.pdf`;
}

export function buildDrawingGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  projectSeq: string,
  itemCode: string,
  codeBars: string,
  revision: string,
  ext: string
): string {
  const path = `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/${itemCode}/DWG/${codeBars}_rev-${revision}.${ext}`;
  const { assertGcsPath } = require('./epc-guardrails');
  assertGcsPath(path, 'epc-coding.buildDrawingGcsPath');
  return path;
}

export function buildEpcQtnGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  projectSeq: string,
  offerNumber: string,
  attachmentSeq: number,
  attachmentLabel: string,
): string {
  const seq = String(attachmentSeq).padStart(3, '0');
  const label = attachmentLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'baseline';
  const safeName = offerNumber.replace(/\//g, '-');
  return `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${projectSeq}/QTN/${safeName}/rev-na/${seq}-${label}.pdf`;
}

export async function resolveContextualRevision(
  documentNumber: string,
  docType: 'DWG' | 'BOM',
  consumerContext: 'procurement' | 'manufacturing' | 'inspection' | 'general',
  txOrDb: any,
  snapshotRevision?: string
): Promise<{ revisionCode: string; parentEntityId: number; isCurrent: boolean } | null> {
  if (docType === 'DWG') {
    if (consumerContext === 'inspection' && snapshotRevision) {
      const r = await txOrDb.execute(
        sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
            WHERE dwg_control_number = ${documentNumber} AND revision_code = ${snapshotRevision}
            LIMIT 1`
      );
      if (r.rows.length > 0) {
        const row = r.rows[0] as any;
        return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
      }
      return null;
    }

    if (consumerContext === 'procurement') {
      let r = await txOrDb.execute(
        sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
            WHERE dwg_control_number = ${documentNumber} AND is_current = TRUE AND released_for_procurement = TRUE
            LIMIT 1`
      );
      if (r.rows.length === 0) {
        r = await txOrDb.execute(
          sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
              WHERE dwg_control_number = ${documentNumber} AND released_for_procurement = TRUE
              ORDER BY released_for_procurement_at DESC NULLS LAST LIMIT 1`
        );
      }
      if (r.rows.length > 0) {
        const row = r.rows[0] as any;
        return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
      }
      return null;
    }

    if (consumerContext === 'manufacturing') {
      let r = await txOrDb.execute(
        sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
            WHERE dwg_control_number = ${documentNumber} AND is_current = TRUE AND released_for_manufacturing = TRUE
            LIMIT 1`
      );
      if (r.rows.length === 0) {
        r = await txOrDb.execute(
          sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
              WHERE dwg_control_number = ${documentNumber} AND released_for_manufacturing = TRUE
              ORDER BY released_for_manufacturing_at DESC NULLS LAST LIMIT 1`
        );
      }
      if (r.rows.length > 0) {
        const row = r.rows[0] as any;
        return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
      }
      return null;
    }

    const r = await txOrDb.execute(
      sql`SELECT id, revision_code, is_current FROM epc_drawing_controls
          WHERE dwg_control_number = ${documentNumber} AND is_current = TRUE
          LIMIT 1`
    );
    if (r.rows.length > 0) {
      const row = r.rows[0] as any;
      return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
    }
    return null;
  }

  if (docType === 'BOM') {
    if (consumerContext === 'inspection' && snapshotRevision) {
      const r = await txOrDb.execute(
        sql`SELECT id, revision_code, is_current FROM epc_bom_headers
            WHERE bom_number = ${documentNumber} AND revision_code = ${snapshotRevision}
            LIMIT 1`
      );
      if (r.rows.length > 0) {
        const row = r.rows[0] as any;
        return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
      }
      return null;
    }

    if (consumerContext === 'procurement' || consumerContext === 'manufacturing') {
      let r = await txOrDb.execute(
        sql`SELECT id, revision_code, is_current FROM epc_bom_headers
            WHERE bom_number = ${documentNumber} AND is_current = TRUE AND status = 'released'
            LIMIT 1`
      );
      if (r.rows.length === 0) {
        r = await txOrDb.execute(
          sql`SELECT id, revision_code, is_current FROM epc_bom_headers
              WHERE bom_number = ${documentNumber} AND status = 'released'
              ORDER BY released_at DESC NULLS LAST LIMIT 1`
        );
      }
      if (r.rows.length > 0) {
        const row = r.rows[0] as any;
        return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
      }
      return null;
    }

    const r = await txOrDb.execute(
      sql`SELECT id, revision_code, is_current FROM epc_bom_headers
          WHERE bom_number = ${documentNumber} AND is_current = TRUE
          LIMIT 1`
    );
    if (r.rows.length > 0) {
      const row = r.rows[0] as any;
      return { revisionCode: row.revision_code, parentEntityId: row.id, isCurrent: row.is_current };
    }
    return null;
  }

  return null;
}
