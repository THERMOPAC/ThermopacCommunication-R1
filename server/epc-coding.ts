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
): Promise<{ operationalCode: string; projectSeq: string }> {
  const custResult = await tx.execute(
    sql`SELECT short_code FROM customers WHERE id = ${customerId}`
  );
  if (custResult.rows.length === 0) {
    throw new Error(`Customer not found: ${customerId}`);
  }
  const shortCode = (custResult.rows[0] as any).short_code;

  const seqResult = await tx.execute(
    sql`SELECT COALESCE(MAX(CAST(project_seq AS INTEGER)), 0) + 1 AS next_seq
        FROM projects
        WHERE continent_code = ${continentCode}
          AND country_code = ${countryCode}
          AND customer_id = ${customerId}
          AND fy_code = ${fyCode}`
  );
  const nextSeq = (seqResult.rows[0] as any).next_seq;
  const projectSeq = String(nextSeq).padStart(3, '0');
  const operationalCode = `TP-${continentCode}-${countryCode}-${shortCode}-${fyCode}-${projectSeq}`;

  return { operationalCode, projectSeq };
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
    sql`SELECT operational_code FROM projects WHERE id = ${projectId}`
  );
  if (projectResult.rows.length === 0) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const operationalCode = (projectResult.rows[0] as any).operational_code;

  const prefix = `${operationalCode}-${docTypeAbbr}-`;
  const seqResult = await tx.execute(
    sql.raw(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(${docType.column} FROM '-(\\d{4})$') AS INTEGER)), 0) + 1 AS next_seq
       FROM ${docType.table}
       WHERE project_id = ${projectId}`
    )
  );
  const nextSeq = (seqResult.rows[0] as any).next_seq;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}
