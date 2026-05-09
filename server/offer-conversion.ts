import { db } from './db';
import { pool } from './db';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as epcCoding from './epc-coding';
import { VALID_PROJECT_ITEM_SOURCES, type ProjectItemSource } from '@shared/schema';
import { freezeConfirmedArtifact, attachConfirmedArtifactToEpc, storeQuotationPdfArtifact } from './utils/quotation-pdf-artifact';
import { generateExecutionDrafts } from './pipeline/generate-execution-drafts';
import { executeFullAutoPipeline } from './pipeline/full-auto-orchestrator';

export interface EpcParams {
  continentCode: string;
  countryCode: string;
  projectType?: string;
  priority?: string;
  startDate: string;
  targetEndDate: string;
  managerId: number;
  automationMode?: 'manual' | 'full_auto';
  disciplineCode?: string;
  mdmt?: string;
  inspectionBy?: string;
  voltageFrequency?: string;
}

interface ValidationFailure {
  field: string;
  reason: string;
}

interface ConversionResult {
  offer: any;
  project: any;
  orderNumber: string;
  snapshotId: number;
  conversionId: string;
  itemsCreated: number;
  itemsPendingMapping: Array<{ offerItemId: number; description: string; taskId: number }>;
  alreadyConverted?: boolean;
  automationResult?: any;
}

function deriveFyCode(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear() % 100;
  if (month >= 4) {
    return `${String(year).padStart(2, '0')}${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${String((year - 1 + 100) % 100).padStart(2, '0')}${String(year).padStart(2, '0')}`;
}

function deriveFinancialYear(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4) {
    return `FY${String(year % 100).padStart(2, '0')}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `FY${String((year - 1) % 100).padStart(2, '0')}-${String(year % 100).padStart(2, '0')}`;
}

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  'IN': 'AS', 'AE': 'AS', 'SA': 'AS', 'QA': 'AS', 'KW': 'AS', 'BH': 'AS', 'OM': 'AS',
  'IQ': 'AS', 'IR': 'AS', 'PK': 'AS', 'BD': 'AS', 'LK': 'AS', 'NP': 'AS', 'MM': 'AS',
  'JP': 'AS', 'KR': 'AS', 'CN': 'AS', 'SG': 'AS', 'MY': 'AS', 'TH': 'AS', 'ID': 'AS',
  'PH': 'AS', 'VN': 'AS', 'YE': 'AS', 'JO': 'AS', 'LB': 'AS', 'AZ': 'AS', 'GE': 'AS',
  'AM': 'AS', 'KZ': 'AS', 'UZ': 'AS', 'TR': 'AS',
  'US': 'NA', 'CA': 'NA', 'MX': 'NA', 'PA': 'NA', 'TT': 'NA',
  'BR': 'SA', 'AR': 'SA', 'CL': 'SA', 'CO': 'SA', 'PE': 'SA', 'EC': 'SA',
  'VE': 'SA', 'UY': 'SA', 'PY': 'SA', 'BO': 'SA',
  'GB': 'EU', 'DE': 'EU', 'FR': 'EU', 'IT': 'EU', 'ES': 'EU', 'PL': 'EU', 'BG': 'EU',
  'RO': 'EU', 'HU': 'EU', 'CZ': 'EU', 'SK': 'EU', 'HR': 'EU', 'RS': 'EU', 'UA': 'EU', 'BY': 'EU',
  'AU': 'OC', 'NZ': 'OC',
  'NG': 'AF', 'ZA': 'AF', 'KE': 'AF', 'GH': 'AF', 'TZ': 'AF', 'EG': 'AF', 'MA': 'AF',
  'TN': 'AF', 'LY': 'AF', 'DZ': 'AF', 'ET': 'AF', 'GN': 'AF', 'SD': 'AF',
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(epcCoding.COUNTRY_CODES)) {
  COUNTRY_NAME_TO_CODE[name.toLowerCase()] = code;
}

export function validateSourceEnum(source: string | null | undefined): boolean {
  if (!source) return true;
  return (VALID_PROJECT_ITEM_SOURCES as readonly string[]).includes(source);
}

export async function validatePreConversion(
  offerId: number
): Promise<{ valid: boolean; failures: ValidationFailure[]; offer?: any; items?: any[] }> {
  const failures: ValidationFailure[] = [];

  const offerResult = await pool.query(
    `SELECT * FROM offers WHERE id = $1`, [offerId]
  );
  if (offerResult.rows.length === 0) {
    return { valid: false, failures: [{ field: 'offerId', reason: 'Offer not found' }] };
  }
  const offer = offerResult.rows[0];

  if (offer.status !== 'Approved') {
    failures.push({ field: 'status', reason: `Only approved offers can be confirmed. Current status: ${offer.status}` });
  }

  if (!offer.customer_id) {
    failures.push({ field: 'customerId', reason: 'Customer not assigned to offer' });
  }

  const itemsResult = await pool.query(
    `SELECT * FROM offer_items WHERE offer_id = $1 ORDER BY sort_order`, [offerId]
  );
  if (itemsResult.rows.length === 0) {
    failures.push({ field: 'items', reason: 'Offer must have at least 1 line item' });
  } else {
    const items = itemsResult.rows;
    const itemIdSet = new Set(items.map((i: any) => i.id));
    for (const item of items) {
      if (item.is_sub_item) {
        if (!item.parent_item_id) {
          failures.push({
            field: 'itemHierarchy',
            reason: `Sub-item "${item.description}" (id=${item.id}) is missing a parent reference.`,
          });
        } else if (!itemIdSet.has(item.parent_item_id)) {
          failures.push({
            field: 'itemHierarchy',
            reason: `Sub-item "${item.description}" (id=${item.id}) references parent id=${item.parent_item_id} which does not exist in this offer.`,
          });
        } else {
          // cycle detection for deep hierarchies
          const visitedIds = new Set<number>();
          let cur: any = item;
          while (cur?.parent_item_id) {
            if (visitedIds.has(cur.parent_item_id)) {
              failures.push({
                field: 'itemHierarchy',
                reason: `Circular reference detected in item hierarchy near "${item.description}" (id=${item.id}).`,
              });
              break;
            }
            visitedIds.add(cur.parent_item_id);
            cur = items.find((p: any) => p.id === cur.parent_item_id) || null;
          }
        }
      }
    }
  }

  const totalAmount = parseFloat(offer.total_amount || '0');
  if (totalAmount <= 0) {
    failures.push({ field: 'totalAmount', reason: 'Total amount must be greater than 0' });
  }

  if (!offer.delivery_terms || offer.delivery_terms.trim() === '') {
    failures.push({ field: 'deliveryTerms', reason: 'Delivery terms not specified' });
  }

  return { valid: failures.length === 0, failures, offer, items: itemsResult.rows };
}

const STALE_SNAPSHOT_MINUTES = 10;

async function checkIdempotencyInTx(offerId: number, client: any): Promise<ConversionResult | null> {
  const snapResult = await client.query(
    `SELECT s.*, p.code as project_code, p.name as project_name, p.status as project_status, p.id as pid
     FROM offer_conversion_snapshots s
     LEFT JOIN projects p ON p.id = s.project_id
     WHERE s.offer_id = $1 AND s.conversion_status != 'recovered'
     FOR UPDATE OF s`, [offerId]
  );
  if (snapResult.rows.length === 0) return null;

  const snap = snapResult.rows[0];

  if (snap.conversion_status === 'completed') {
    const offerResult = await client.query(`SELECT * FROM offers WHERE id = $1`, [offerId]);
    return {
      offer: offerResult.rows[0],
      project: {
        id: snap.pid,
        code: snap.project_code,
        name: snap.project_name,
        status: snap.project_status,
      },
      orderNumber: snap.order_number,
      snapshotId: snap.id,
      conversionId: snap.conversion_id,
      itemsCreated: 0,
      itemsPendingMapping: [],
      alreadyConverted: true,
    };
  }

  const snapAge = (Date.now() - new Date(snap.converted_at).getTime()) / 60000;
  if (snapAge > STALE_SNAPSHOT_MINUTES) {
    const recoveryDetail = {
      action: 'stale_snapshot_auto_recovery',
      conversionId: snap.conversion_id,
      offerId,
      orderNumber: snap.order_number,
      staleStatus: snap.conversion_status,
      ageMinutes: parseFloat(snapAge.toFixed(1)),
      orphanProjectId: snap.project_id || null,
      recoveredAt: new Date().toISOString(),
    };
    console.log(`[offer-conversion] AUTO-RECOVERY: Cleaning stale incomplete snapshot ${snap.id} (conversion_id=${snap.conversion_id}, status=${snap.conversion_status}, age=${snapAge.toFixed(1)}min)`);

    if (snap.project_id) {
      const projCheck = await client.query(
        `SELECT id FROM projects WHERE id = $1 AND source_conversion_id = $2`,
        [snap.project_id, snap.conversion_id]
      );
      if (projCheck.rows.length > 0) {
        await client.query(`DELETE FROM project_tasks pt USING tasks t WHERE pt.project_id = $1 AND pt.task_id = t.id`, [snap.project_id]);
        await client.query(`DELETE FROM project_members WHERE project_id = $1`, [snap.project_id]);
        await client.query(`DELETE FROM project_items WHERE project_id = $1`, [snap.project_id]);
        await client.query(`DELETE FROM project_workflow_events WHERE project_id = $1`, [snap.project_id]);
        await client.query(`UPDATE offer_conversion_snapshots SET project_id = NULL WHERE id = $1`, [snap.id]);
        await client.query(`DELETE FROM projects WHERE id = $1`, [snap.project_id]);
      } else {
        console.log(`[offer-conversion] AUTO-RECOVERY: Orphan project ${snap.project_id} does not match conversion_id ${snap.conversion_id} — skipping project cleanup, removing snapshot only`);
        await client.query(`UPDATE offer_conversion_snapshots SET project_id = NULL WHERE id = $1`, [snap.id]);
      }
    }

    await client.query(
      `UPDATE offer_conversion_snapshots
       SET conversion_status = 'recovered', error_detail = $1, project_id = NULL
       WHERE id = $2`,
      [JSON.stringify(recoveryDetail), snap.id]
    );

    return null;
  }

  throw Object.assign(
    new Error(`Conversion in progress (status: ${snap.conversion_status}, started ${snapAge.toFixed(0)}min ago). Please wait or retry after ${STALE_SNAPSHOT_MINUTES} minutes.`),
    { statusCode: 409 }
  );
}

async function generateOrderNumber(fyCode: string, client: any): Promise<string> {
  const prefix = fyCode;
  const seqResult = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '-(\\d+)$') AS INTEGER)), 0) + 1 AS next_seq
     FROM offer_conversion_snapshots
     WHERE order_number LIKE $1`, [`${prefix}-%`]
  );
  const nextSeq = seqResult.rows[0].next_seq;
  return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
}

export async function executeOfferConversion(
  offerId: number,
  epcParams: EpcParams,
  userId: number
): Promise<ConversionResult> {
  const validation = await validatePreConversion(offerId);
  if (!validation.valid) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: validation.failures,
    });
  }

  if (epcParams.startDate && epcParams.targetEndDate) {
    if (new Date(epcParams.startDate) >= new Date(epcParams.targetEndDate)) {
      throw Object.assign(new Error('Pre-conversion validation failed'), {
        statusCode: 422,
        failures: [{ field: 'targetEndDate', reason: 'Target end date must be after start date' }],
      });
    }
  }

  const offer = validation.offer!;
  const offerItems = validation.items!;

  let { continentCode, countryCode } = epcParams;

  if (!countryCode && offer.customer_id) {
    const custResult = await pool.query(
      `SELECT country_name, continent FROM customers WHERE id = $1`, [offer.customer_id]
    );
    if (custResult.rows.length > 0) {
      const cust = custResult.rows[0];
      if (cust.country_name) {
        countryCode = COUNTRY_NAME_TO_CODE[cust.country_name.toLowerCase()] || '';
      }
    }
  }

  if (!continentCode && countryCode) {
    continentCode = COUNTRY_TO_CONTINENT[countryCode] || '';
  }

  if (!continentCode || !epcCoding.validateContinentCode(continentCode)) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'continentCode', reason: 'Continent code not derivable — must be supplied' }],
    });
  }
  if (!countryCode || !epcCoding.validateCountryCode(countryCode)) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'countryCode', reason: 'Country code not derivable — must be supplied' }],
    });
  }

  if (!epcParams.managerId) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'managerId', reason: 'Project manager must be specified' }],
    });
  }
  if (!epcParams.startDate) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'startDate', reason: 'Project start date must be specified' }],
    });
  }
  if (!epcParams.targetEndDate) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'targetEndDate', reason: 'Project target end date must be specified' }],
    });
  }

  const managerCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [epcParams.managerId]);
  if (managerCheck.rows.length === 0) {
    throw Object.assign(new Error('Pre-conversion validation failed'), {
      statusCode: 422,
      failures: [{ field: 'managerId', reason: 'Specified manager user not found' }],
    });
  }

  const fyCode = deriveFyCode();
  const financialYear = deriveFinancialYear();
  const conversionId = uuidv4();
  const priority = epcParams.priority || 'Medium';
  const projectType = epcParams.projectType || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotent = await checkIdempotencyInTx(offerId, client);
    if (idempotent) {
      await client.query('COMMIT');
      return idempotent;
    }

    const orderNumber = await generateOrderNumber(fyCode, client);

    const headerSnapshot = {
      offerNumber: offer.offer_number,
      customerId: offer.customer_id,
      customerName: offer.customer_name,
      customerEmail: offer.customer_email,
      customerAddress: offer.customer_address,
      contactPerson: offer.contact_person,
      subject: offer.subject,
      currency: offer.currency,
      subtotal: offer.subtotal,
      discountPercent: offer.discount_percent,
      discountAmount: offer.discount_amount,
      taxPercent: offer.tax_percent,
      taxAmount: offer.tax_amount,
      totalAmount: offer.total_amount,
      paymentTerms: offer.payment_terms,
      deliveryTerms: offer.delivery_terms,
      notes: offer.notes,
      termsAndConditions: offer.terms_and_conditions,
      language: offer.language,
    };

    const itemsSnapshot = offerItems.map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      productCode: item.product_code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      discountPercent: item.discount_percent,
      totalPrice: item.total_price,
      hsnSacCode: item.hsn_sac_code,
      isSubItem: item.is_sub_item,
      parentItemId: item.parent_item_id,
      sortOrder: item.sort_order,
    }));

    const epcParamsSnapshot = {
      continentCode,
      countryCode,
      fyCode,
      managerId: epcParams.managerId,
      startDate: epcParams.startDate,
      targetEndDate: epcParams.targetEndDate,
      projectType,
      priority,
    };

    const snapInsert = await client.query(
      `INSERT INTO offer_conversion_snapshots 
       (conversion_id, offer_id, offer_revision, order_number, header_snapshot, items_snapshot, epc_params_snapshot, conversion_status, converted_by, converted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'initiated', $8, NOW())
       RETURNING id`,
      [conversionId, offerId, offer.revision || 0, orderNumber,
        JSON.stringify(headerSnapshot), JSON.stringify(itemsSnapshot), JSON.stringify(epcParamsSnapshot),
        userId]
    );
    const snapshotId = snapInsert.rows[0].id;

    await client.query(
      `UPDATE offer_conversion_snapshots SET conversion_status = 'snapshot_created' WHERE id = $1`,
      [snapshotId]
    );

    const { getNextProjectSeq } = await import('./doc-sequence-service');
    const { assertProjectCode } = await import('./epc-guardrails');
    const projectSeq = await getNextProjectSeq(fyCode, client);
    const projectCode = `${fyCode}-${projectSeq}`;
    assertProjectCode(projectCode, 'offer-conversion.executeOfferConversion');

    const custResult = await client.query(
      `SELECT short_code, bp_name, bp_code FROM customers WHERE id = $1`, [offer.customer_id]
    );
    if (custResult.rows.length === 0) {
      throw new Error(`Customer not found: ${offer.customer_id}`);
    }
    const shortCode = custResult.rows[0].short_code;
    const customerName = custResult.rows[0].bp_name;
    const customerBpCode = custResult.rows[0].bp_code || '';

    const projectName = offer.subject || `EPC Project - ${customerName}`;
    const projectDescription = [
      offer.notes || '',
      offer.terms_and_conditions ? `Terms: ${offer.terms_and_conditions}` : '',
    ].filter(Boolean).join('\n') || `Converted from Offer ${offer.offer_number}`;

    const currencyMap: Record<string, string> = { 'USD': 'USD', 'EUR': 'EUR', 'INR': 'INR' };
    const projectCurrency = currencyMap[offer.currency] || 'INR';

    const projectInsert = await client.query(
      `INSERT INTO projects
       (name, description, code, project_type, status, priority, financial_year,
        customer_id, client_name, start_date, target_end_date,
        estimated_budget, currency, progress, manager_id, created_by,
        continent_code, country_code, fy_code, project_seq,
        source_offer_id, source_offer_revision, source_order_number, source_conversion_id, project_origin,
        automation_mode,
        discipline_code, mdmt, inspection_by, voltage_frequency,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6,
               $7, $8, $9, $10,
               $11, $12, 0, $13, $14,
               $15, $16, $17, $18,
               $19, $20, $21, $22, 'sales_offer',
               $23,
               $24, $25, $26, $27,
               NOW(), NOW())
       RETURNING *`,
      [
        projectName, projectDescription, projectCode, projectType, priority, financialYear,
        offer.customer_id, customerName, epcParams.startDate, epcParams.targetEndDate,
        offer.total_amount, projectCurrency, epcParams.managerId, userId,
        continentCode, countryCode, fyCode, projectSeq,
        offerId, offer.revision || 0, orderNumber, conversionId,
        epcParams.automationMode || 'full_auto',
        epcParams.disciplineCode || null, epcParams.mdmt || null,
        epcParams.inspectionBy || null, epcParams.voltageFrequency || null
      ]
    );
    const project = projectInsert.rows[0];

    await client.query(
      `UPDATE offer_conversion_snapshots SET project_id = $1, conversion_status = 'project_created' WHERE id = $2`,
      [project.id, snapshotId]
    );

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, assigned_date, is_active)
       VALUES ($1, $2, 'project_manager', NOW(), true)`,
      [project.id, epcParams.managerId]
    );
    if (userId !== epcParams.managerId) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, assigned_date, is_active)
         VALUES ($1, $2, 'project_manager', NOW(), true)`,
        [project.id, userId]
      );
    }
    const seniorMgrResult = await client.query(
      `SELECT id FROM users WHERE role = 'Senior Manager' AND department = 'Design' AND is_active = true LIMIT 1`
    );
    if (seniorMgrResult.rows.length > 0) {
      const smId = seniorMgrResult.rows[0].id;
      if (smId !== epcParams.managerId && smId !== userId) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, role, assigned_date, is_active)
           VALUES ($1, $2, 'senior_manager', NOW(), true)`,
          [project.id, smId]
        );
      }
    }

    const defaultPhases: Array<{ name: string; description: string; order: number; deliverables: Array<{ name: string; description: string }> }> = [
      { name: 'Design & Engineering', description: 'Engineering design, drawings, and technical documentation', order: 1, deliverables: [
        { name: 'General Arrangement Drawing (GA)', description: 'Overall layout and arrangement drawing of the system' },
        { name: 'P&ID (Piping & Instrumentation Diagram)', description: 'Process flow with piping and instrumentation details' },
        { name: 'Electrical SLD (Single Line Diagram)', description: 'Electrical single line diagram for power distribution' },
        { name: 'Bill of Materials (BOM)', description: 'Complete bill of materials for all components' },
        { name: 'Design Calculation Sheet', description: 'Engineering calculations for equipment sizing and design parameters' },
      ]},
      { name: 'Procurement', description: 'Material procurement, vendor selection, and purchase orders', order: 2, deliverables: [
        { name: 'Vendor Comparison Statement', description: 'Technical and commercial comparison of vendor quotations' },
        { name: 'Purchase Orders Issued', description: 'All purchase orders placed and confirmed with vendors' },
        { name: 'Material Receipt & Inspection Report', description: 'Incoming material inspection and acceptance records' },
        { name: 'Vendor Document Submittals', description: 'Technical data sheets, test certificates, and compliance documents from vendors' },
      ]},
      { name: 'Manufacturing', description: 'Fabrication, assembly, and shop-floor production', order: 3, deliverables: [
        { name: 'Fabrication Drawings (Shop Drawings)', description: 'Detailed fabrication drawings for shop-floor production' },
        { name: 'Welding Procedure Specification (WPS)', description: 'Approved welding procedures for all critical joints' },
        { name: 'Stage Inspection Reports', description: 'In-process quality inspection records at key manufacturing stages' },
        { name: 'Assembly & Fitment Report', description: 'Final assembly and fitment verification records' },
      ]},
      { name: 'Quality Control & Inspection', description: 'Quality checks, inspections, and testing', order: 4, deliverables: [
        { name: 'Quality Assurance Plan (QAP)', description: 'Comprehensive QAP covering all inspection and test requirements' },
        { name: 'NDT Reports', description: 'Non-destructive testing reports (RT/UT/DPT/MPT as applicable)' },
        { name: 'Hydro Test / Pressure Test Certificate', description: 'Hydrostatic or pneumatic test certificates' },
        { name: 'Final Inspection & Test Report', description: 'Final product inspection and acceptance test records' },
        { name: 'Material Traceability Certificate (MTC)', description: 'Mill test certificates and material traceability records' },
      ]},
      { name: 'Dispatch & Logistics', description: 'Packing, dispatch, and shipping coordination', order: 5, deliverables: [
        { name: 'Packing List', description: 'Detailed packing list with dimensions and weights' },
        { name: 'Dispatch Clearance Certificate', description: 'Pre-dispatch inspection and clearance approval' },
        { name: 'Shipping Documents', description: 'Bill of lading, commercial invoice, and customs documents' },
        { name: 'Transportation & Insurance Records', description: 'Transport plan, route details, and insurance documentation' },
      ]},
      { name: 'Installation & Commissioning', description: 'Site installation, commissioning, and handover', order: 6, deliverables: [
        { name: 'Installation Procedure', description: 'Step-by-step installation methodology and sequence plan' },
        { name: 'Pre-Commissioning Checklist', description: 'System readiness verification before commissioning' },
        { name: 'Commissioning Report', description: 'Performance test results and commissioning completion record' },
        { name: 'Operation & Maintenance Manual', description: 'Complete O&M manual with operating procedures and maintenance schedule' },
        { name: 'Handover Certificate', description: 'Formal project handover and customer acceptance certificate' },
      ]},
    ];
    for (const phase of defaultPhases) {
      const phaseDeptMap: Record<string, string[]> = {
        'Design & Engineering': ['Design'],
        'Procurement': ['Design', 'Purchase'],
        'Manufacturing': ['Production'],
        'Quality Control & Inspection': ['Production', 'Quality Control'],
        'Dispatch & Logistics': ['Administration'],
        'Installation & Commissioning': ['After Sales'],
      };
      const depts = phaseDeptMap[phase.name] || [];
      let leadId = userId;
      for (const dept of depts) {
        const leadResult = await client.query(
          `SELECT id FROM users WHERE department = $1 AND is_active = true AND role IN ('General Manager', 'Senior Manager', 'Manager')
           ORDER BY CASE role WHEN 'General Manager' THEN 1 WHEN 'Senior Manager' THEN 2 WHEN 'Manager' THEN 3 END
           LIMIT 1`,
          [dept]
        );
        if (leadResult.rows.length > 0) { leadId = leadResult.rows[0].id; break; }
      }
      const phaseResult = await client.query(
        `INSERT INTO project_phases (project_id, name, description, "order", start_date, target_end_date, phase_lead_id, status, progress, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, NOW(), NOW()) RETURNING id`,
        [project.id, phase.name, phase.description, phase.order, epcParams.startDate, epcParams.targetEndDate, leadId]
      );
      const phaseId = phaseResult.rows[0].id;
      for (const deliv of phase.deliverables) {
        await client.query(
          `INSERT INTO deliverables (project_id, phase_id, name, description, due_date, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())`,
          [project.id, phaseId, deliv.name, deliv.description, epcParams.targetEndDate]
        );
      }
    }

    // Topological sort — parents always before children, supports unlimited depth
    const offerItemMap = new Map<number, any>(offerItems.map((i: any) => [i.id, i]));
    const topoVisited = new Set<number>();
    const topoOrdered: any[] = [];
    function topoVisit(item: any) {
      if (topoVisited.has(item.id)) return;
      if (item.parent_item_id && offerItemMap.has(item.parent_item_id)) {
        topoVisit(offerItemMap.get(item.parent_item_id));
      }
      topoVisited.add(item.id);
      topoOrdered.push(item);
    }
    for (const item of offerItems) topoVisit(item);

    const offerItemIdToProjectItemId: Record<number, number> = {};
    let itemsCreated = 0;
    const itemsPendingMapping: Array<{ offerItemId: number; description: string; taskId: number }> = [];

    async function findOrCreateMasterItem(
      client: any, productCode: string, description: string, unit: string,
      estimatedCost: string, hsnSacCode: string | null, bpCode: string
    ): Promise<number> {
      const masterItemCode = productCode;
      const existing = await client.query(
        `SELECT id FROM master_items WHERE item_code = $1 LIMIT 1`,
        [masterItemCode]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }
      const productRow = await client.query(
        `SELECT make_or_buy FROM products WHERE product_code = $1 LIMIT 1`,
        [productCode]
      );
      const makeOrBuy = productRow.rows.length > 0 ? (productRow.rows[0].make_or_buy || 'Make') : 'Make';
      const created = await client.query(
        `INSERT INTO master_items
         (item_code, description, uom, make_or_buy, estimated_cost, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [
          masterItemCode, description, unit || 'set', makeOrBuy,
          estimatedCost || null,
          hsnSacCode ? `HSN/SAC: ${hsnSacCode}` : null
        ]
      );
      return created.rows[0].id;
    }

    // Single pass in topological order — handles Parent → Child → Child-to-Child (unlimited depth)
    for (const offerItem of topoOrdered) {
      const parentProjectItemId = offerItem.parent_item_id
        ? offerItemIdToProjectItemId[offerItem.parent_item_id] || null
        : null;

      const baseItemCode = customerBpCode ? `${customerBpCode}-${offerItem.product_code || ''}` : (offerItem.product_code || '');
      const projectItemCode = epcCoding.buildProjectItemCode(baseItemCode, fyCode, projectSeq);
      const codeBars = await epcCoding.generateCodeBars(customerBpCode, fyCode, projectSeq, client);
      const masterItemId = offerItem.product_code
        ? await findOrCreateMasterItem(
            client, offerItem.product_code, offerItem.description,
            offerItem.unit, offerItem.total_price, offerItem.hsn_sac_code, customerBpCode
          )
        : null;

      let itemMakeOrBuy = 'Make';
      if (masterItemId) {
        const miRow = await client.query(`SELECT make_or_buy FROM master_items WHERE id = $1`, [masterItemId]);
        if (miRow.rows.length > 0 && miRow.rows[0].make_or_buy) itemMakeOrBuy = miRow.rows[0].make_or_buy;
      }

      const piResult = await client.query(
        `INSERT INTO project_items
         (project_id, project_code, item_id, item_code, code_bars, description, uom, make_or_buy,
          quantity, estimated_cost, notes, status, source,
          parent_project_item_id,
          product_code,
          source_offer_id, source_offer_item_id, source_order_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, 'Not Started', 'sales_offer',
          $12, $13,
          $14, $15, $16, NOW(), NOW())
         ON CONFLICT (source_order_number, source_offer_item_id)
           WHERE source_order_number IS NOT NULL AND source_offer_item_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
          project.id, projectCode, masterItemId,
          projectItemCode, codeBars, offerItem.description, offerItem.unit || 'set', itemMakeOrBuy,
          offerItem.quantity, offerItem.total_price,
          offerItem.description,
          parentProjectItemId,
          offerItem.product_code || null,
          offerId, offerItem.id, orderNumber
        ]
      );
      if (piResult.rows.length > 0) {
        offerItemIdToProjectItemId[offerItem.id] = piResult.rows[0].id;
        itemsCreated++;
      }
    }

    // BOM Explosion: for each Level 2 offer item with no Level 3 children in the offer,
    // auto-create Level 3 project items from product_children in the Product Master.
    const level2Items = topoOrdered.filter((i: any) => !!i.parent_item_id);
    for (const offerItem of level2Items) {
      // Skip if this Level 2 item already has children in the offer (manually added Level 3)
      const hasOfferChildren = offerItems.some((i: any) => i.parent_item_id === offerItem.id);
      if (hasOfferChildren) continue;

      // No project item created for this offer item (e.g. duplicate conflict) — skip
      const parentProjectItemId = offerItemIdToProjectItemId[offerItem.id];
      if (!parentProjectItemId) continue;

      // Look up the product by product_code
      if (!offerItem.product_code) continue;
      const productRow = await client.query(
        `SELECT id FROM products WHERE product_code = $1 LIMIT 1`,
        [offerItem.product_code]
      );
      if (productRow.rows.length === 0) continue;
      const productId = productRow.rows[0].id;

      // Get children from product_children
      const childRows = await client.query(
        `SELECT pc.quantity, pc.sort_order, p.product_code, p.description, p.unit,
                p.unit_price, p.make_or_buy, p.hsn_sac_code
         FROM product_children pc
         JOIN products p ON p.id = pc.child_product_id
         WHERE pc.parent_product_id = $1
         ORDER BY pc.sort_order, pc.id`,
        [productId]
      );
      if (childRows.rows.length === 0) continue;

      for (const child of childRows.rows) {
        // Avoid duplicate on re-run: skip if a project item with same parent + item_code exists
        const dupCheck = await client.query(
          `SELECT id FROM project_items
           WHERE project_id = $1 AND parent_project_item_id = $2 AND item_code LIKE $3`,
          [project.id, parentProjectItemId, `%-${child.product_code}-%`]
        );
        if (dupCheck.rows.length > 0) continue;

        const childBaseCode = customerBpCode
          ? `${customerBpCode}-${child.product_code}`
          : child.product_code;
        const childItemCode = epcCoding.buildProjectItemCode(childBaseCode, fyCode, projectSeq);
        const childCodeBars = await epcCoding.generateCodeBars(customerBpCode, fyCode, projectSeq, client);

        const childMasterItemId = child.product_code
          ? await findOrCreateMasterItem(
              client, child.product_code, child.description,
              child.unit, child.unit_price, child.hsn_sac_code, customerBpCode
            )
          : null;

        await client.query(
          `INSERT INTO project_items
           (project_id, project_code, item_id, item_code, code_bars, description, uom, make_or_buy,
            quantity, estimated_cost, notes, status, source,
            parent_project_item_id,
            product_code,
            source_offer_id, source_order_number, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, 'Not Started', 'sales_offer',
            $12, $13,
            $14, $15, NOW(), NOW())`,
          [
            project.id, projectCode, childMasterItemId,
            childItemCode, childCodeBars, child.description, child.unit || 'set', child.make_or_buy || 'Make',
            child.quantity || 1, child.unit_price,
            child.description,
            parentProjectItemId,
            child.product_code || null,
            offerId, orderNumber,
          ]
        );
        itemsCreated++;
      }
    }

    await client.query(
      `UPDATE offer_conversion_snapshots SET conversion_status = 'items_created' WHERE id = $1`,
      [snapshotId]
    );

    await client.query(
      `UPDATE offers SET status = 'Order Confirmed', updated_at = NOW() WHERE id = $1`,
      [offerId]
    );

    await client.query(
      `INSERT INTO project_workflow_events
       (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
       VALUES ($1, 'project_created_from_offer', $2, 'offer-conversion', NOW(), false)`,
      [project.id, JSON.stringify({
        conversionId,
        offerId,
        offerNumber: offer.offer_number,
        offerRevision: offer.revision || 0,
        orderNumber,
        snapshotId,
        projectId: project.id,
        projectCode,
        itemsCreated,
        itemsPendingMapping: itemsPendingMapping.length,
        convertedBy: userId,
      })]
    );

    await client.query(
      `UPDATE offer_conversion_snapshots SET conversion_status = 'completed' WHERE id = $1`,
      [snapshotId]
    );

    let confirmedArtifactId = await freezeConfirmedArtifact(offerId, offer.revision || 0);
    if (!confirmedArtifactId) {
      console.log(`[offer-conversion] No existing PDF artifact for offer ${offerId}, auto-generating...`);
      try {
        const fs = await import('fs');
        const { and, eq } = await import('drizzle-orm');
        const { offerTemplates } = await import('@shared/schema');
        const { OfferPdfGenerator } = await import('./offer-pdf-generator');
        const allItems = await pool.query(`SELECT * FROM offer_items WHERE offer_id = $1 ORDER BY sort_order ASC`, [offerId]);
        const generator = new OfferPdfGenerator({
          offerNumber: offer.offer_number,
          revision: offer.revision || 0,
          createdAt: offer.created_at?.toISOString?.() || new Date().toISOString(),
          customerName: offer.customer_name || '',
          customerEmail: offer.customer_email || '',
          customerAddress: offer.customer_address || '',
          contactPerson: offer.contact_person || '',
          subject: offer.subject || '',
          currency: offer.currency || 'USD',
          subtotal: offer.subtotal || '0',
          discountPercent: offer.discount_percent || '0',
          discountAmount: offer.discount_amount || '0',
          taxPercent: offer.tax_percent || '0',
          taxAmount: offer.tax_amount || '0',
          totalAmount: offer.total_amount || '0',
          validUntil: offer.valid_until?.toISOString?.() || '',
          paymentTerms: offer.payment_terms || '',
          deliveryTerms: offer.delivery_terms || '',
          notes: offer.notes || '',
          termsAndConditions: offer.terms_and_conditions || '',
          items: allItems.rows.map((item: any) => ({
            description: item.description,
            productCode: item.product_code || '',
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            discountPercent: item.discount_percent || '0',
            totalPrice: item.total_price,
            hsnSacCode: item.hsn_sac_code || '',
            isSubItem: item.is_sub_item || false,
          })),
        }, { priceMode: 'combined' });

        let templatePath: string | null = null;
        let templatePageRange: { startPage?: number | null; endPage?: number | null } = {};
        const offerLang = offer.language || 'English';
        const [autoTemplate] = await db.select().from(offerTemplates).where(
          and(
            eq(offerTemplates.subject, offer.subject),
            eq(offerTemplates.language, offerLang),
            eq(offerTemplates.isActive, true)
          )
        ).limit(1);
        if (autoTemplate && fs.existsSync(autoTemplate.filePath)) {
          templatePath = autoTemplate.filePath;
          templatePageRange = { startPage: autoTemplate.startPage, endPage: autoTemplate.endPage };
        }

        let pdfBuffer: Buffer;
        if (templatePath && fs.existsSync(templatePath)) {
          pdfBuffer = await generator.generateWithTemplateToBuffer(templatePath, templatePageRange);
        } else {
          pdfBuffer = await generator.generateToBuffer();
        }

        await storeQuotationPdfArtifact(pdfBuffer, offerId, offer.offer_number, offer.revision || 0, 'combined', userId);
        console.log(`[offer-conversion] Auto-generated quotation PDF for offer ${offerId}`);
        confirmedArtifactId = await freezeConfirmedArtifact(offerId, offer.revision || 0);
      } catch (pdfErr: any) {
        console.error(`[offer-conversion] Auto PDF generation failed:`, pdfErr);
        await client.query('ROLLBACK');
        const err: any = new Error('Failed to auto-generate quotation PDF during order confirmation');
        err.statusCode = 422;
        err.failures = [{ field: 'quotation_pdf', reason: `Auto-generation failed: ${pdfErr.message}. Try generating the PDF manually first.` }];
        throw err;
      }
    }

    await client.query('COMMIT');

    try {
      const { syncProjectItemsToSapBatch } = await import('./project-item-detail-routes');
      console.log(`[offer-conversion] Starting automatic SAP B1 sync for project ${project.id} (${itemsCreated} items)`);
      syncProjectItemsToSapBatch(project.id).then(result => {
        console.log(`[offer-conversion] SAP B1 auto-sync complete for project ${project.id}: ${result.synced} synced, ${result.failed} failed`);
        if (result.errors.length > 0) {
          console.error(`[offer-conversion] SAP B1 sync errors:`, result.errors);
        }
      }).catch(err => {
        console.error(`[offer-conversion] SAP B1 auto-sync failed for project ${project.id}:`, err.message);
      });
    } catch (sapErr: any) {
      console.error(`[offer-conversion] Could not start SAP B1 auto-sync:`, sapErr.message);
    }

    if (confirmedArtifactId) {
      const primaryArtifactId = confirmedArtifactId;
      try {
        const baselineLabel = `Baseline Order — ${orderNumber}`;
        const attachResult = await attachConfirmedArtifactToEpc(
          primaryArtifactId, project.id, projectCode, offerId, offer.offer_number, userId, baselineLabel
        );
        if (attachResult.success) {
          console.log(`[offer-conversion] EPC attachment ${attachResult.epcAttachmentId} created for artifact ${primaryArtifactId}`);
        } else {
          console.error(`[offer-conversion] EPC attachment failed for artifact ${primaryArtifactId}: ${attachResult.error}`);
          await pool.query(
            `INSERT INTO project_workflow_events
             (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
             VALUES ($1, 'quotation_pdf_attachment_failed', $2, 'offer-conversion', NOW(), false)`,
            [project.id, JSON.stringify({
              artifactId: primaryArtifactId, offerId, offerNumber: offer.offer_number,
              projectId: project.id, projectCode, error: attachResult.error,
            })]
          );
          const { createEpcTask } = await import('./epc-task-helpers');
          await createEpcTask({
            projectId: project.id, entityType: 'project', recordId: project.id,
            actionCode: 'quotation_pdf_attachment_repair',
            title: `Quotation PDF attachment failed for project ${projectCode}`,
            description: `The confirmed quotation PDF (artifact #${primaryArtifactId}) could not be attached to the EPC project. Error: ${attachResult.error}. Manual repair required.`,
            assignedTo: epcParams.managerId, createdBy: userId, priority: 'Medium', dueDays: 2,
          });
        }
      } catch (attachErr: any) {
        console.error(`[offer-conversion] EPC attachment error for artifact ${primaryArtifactId}:`, attachErr);
      }
    }

    const updatedOffer = await pool.query(`SELECT * FROM offers WHERE id = $1`, [offerId]);

    let executionDraftSummary = null;
    try {
      executionDraftSummary = await generateExecutionDrafts(project.id, userId);
      console.log(`[offer-conversion] Execution drafts generated: created=${executionDraftSummary.created}, notApplicable=${executionDraftSummary.notApplicable}, blocked=${executionDraftSummary.blocked}`);
    } catch (draftErr: any) {
      console.error(`[offer-conversion] Execution draft generation failed (non-blocking):`, draftErr);
    }

    let automationResult = null;
    const automationMode = epcParams.automationMode || 'full_auto';
    if (automationMode === 'full_auto' && executionDraftSummary) {
      try {
        console.log(`[offer-conversion] Full-auto mode: triggering pipeline for project ${project.id}`);
        automationResult = await executeFullAutoPipeline(project.id, userId);
        console.log(`[offer-conversion] Full-auto pipeline ${automationResult.success ? 'completed' : 'failed'}: run=${automationResult.runId}`);
      } catch (autoErr: any) {
        console.error(`[offer-conversion] Full-auto pipeline error (non-blocking):`, autoErr);
        automationResult = { success: false, error: autoErr.message };
      }
    }

    return {
      offer: updatedOffer.rows[0],
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        automationMode,
      },
      orderNumber,
      snapshotId,
      conversionId,
      itemsCreated,
      itemsPendingMapping,
      executionDraftSummary,
      automationResult,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');

    if (error?.code === '23505' && error?.constraint?.includes('offer_id')) {
      const retryClient = await pool.connect();
      try {
        await retryClient.query('BEGIN');
        const idempotent = await checkIdempotencyInTx(offerId, retryClient);
        await retryClient.query('COMMIT');
        if (idempotent) return idempotent;
      } catch (retryErr) {
        await retryClient.query('ROLLBACK');
      } finally {
        retryClient.release();
      }
      throw Object.assign(
        new Error('Conversion already in progress for this offer. Please retry.'),
        { statusCode: 409 }
      );
    }

    throw error;
  } finally {
    client.release();
  }
}
