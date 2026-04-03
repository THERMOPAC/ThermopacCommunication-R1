import { db } from './db';
import { pool } from './db';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as epcCoding from './epc-coding';
import { VALID_PROJECT_ITEM_SOURCES, type ProjectItemSource } from '@shared/schema';
import { freezeConfirmedArtifact, attachConfirmedArtifactToEpc } from './utils/quotation-pdf-artifact';

export interface EpcParams {
  continentCode: string;
  countryCode: string;
  projectType?: string;
  priority?: string;
  startDate: string;
  targetEndDate: string;
  managerId: number;
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
    `SELECT s.*, p.operational_code, p.name as project_name, p.status as project_status, p.id as pid
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
        operationalCode: snap.operational_code,
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

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(CAST(project_seq AS INTEGER)), 0) + 1 AS next_seq
       FROM projects
       WHERE continent_code = $1 AND country_code = $2 AND customer_id = $3 AND fy_code = $4`,
      [continentCode, countryCode, offer.customer_id, fyCode]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    const projectSeq = String(nextSeq).padStart(3, '0');

    const custResult = await client.query(
      `SELECT short_code, bp_name FROM customers WHERE id = $1`, [offer.customer_id]
    );
    if (custResult.rows.length === 0) {
      throw new Error(`Customer not found: ${offer.customer_id}`);
    }
    const shortCode = custResult.rows[0].short_code;
    const customerName = custResult.rows[0].bp_name;
    const operationalCode = `TP-${continentCode}-${countryCode}-${shortCode}-${fyCode}-${projectSeq}`;

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
        continent_code, country_code, fy_code, project_seq, operational_code,
        source_offer_id, source_offer_revision, source_order_number, source_conversion_id, project_origin,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'planning', $5, $6,
               $7, $8, $9, $10,
               $11, $12, 0, $13, $14,
               $15, $16, $17, $18, $19,
               $20, $21, $22, $23, 'sales_offer',
               NOW(), NOW())
       RETURNING *`,
      [
        projectName, projectDescription, operationalCode, projectType, priority, financialYear,
        offer.customer_id, customerName, epcParams.startDate, epcParams.targetEndDate,
        offer.total_amount, projectCurrency, epcParams.managerId, userId,
        continentCode, countryCode, fyCode, projectSeq, operationalCode,
        offerId, offer.revision || 0, orderNumber, conversionId
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

    const parentItems = offerItems.filter((i: any) => !i.is_sub_item);
    const childItems = offerItems.filter((i: any) => i.is_sub_item);
    const offerItemIdToProjectItemId: Record<number, number> = {};
    let itemsCreated = 0;
    const itemsPendingMapping: Array<{ offerItemId: number; description: string; taskId: number }> = [];

    for (const offerItem of parentItems) {
      const masterItemResult = await client.query(
        `SELECT mi.id, mi.item_code FROM master_items mi
         INNER JOIN products p ON p.product_code = mi.item_code
         WHERE p.id = $1
         LIMIT 1`,
        [offerItem.product_id]
      );

      if (masterItemResult.rows.length > 0) {
        const masterItem = masterItemResult.rows[0];
        const piResult = await client.query(
          `INSERT INTO project_items
           (project_id, project_code, item_id, quantity, estimated_cost, notes, status, source,
            source_offer_id, source_offer_item_id, source_order_number, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Not Started', 'sales_offer', $7, $8, $9, NOW(), NOW())
           ON CONFLICT (source_order_number, source_offer_item_id)
             WHERE source_order_number IS NOT NULL AND source_offer_item_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            project.id, operationalCode, masterItem.id,
            offerItem.quantity, offerItem.total_price,
            offerItem.description,
            offerId, offerItem.id, orderNumber
          ]
        );
        if (piResult.rows.length > 0) {
          offerItemIdToProjectItemId[offerItem.id] = piResult.rows[0].id;
          itemsCreated++;
        }
      } else {
        const taskResult = await client.query(
          `INSERT INTO tasks
           (title, description, status, priority, assigned_to, created_by, due_date, created_at, updated_at)
           VALUES ($1, $2, 'pending', 'high', $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          [
            `Map offer item to master item: ${(offerItem.description || '').substring(0, 80)}`,
            `Offer ${offer.offer_number} item #${offerItem.id} (${offerItem.product_code || 'no code'}) "${offerItem.description}" needs to be mapped to a master item before it can be added to EPC project ${operationalCode}. Order: ${orderNumber}`,
            epcParams.managerId, userId,
            epcParams.startDate
          ]
        );
        await client.query(
          `INSERT INTO project_tasks (project_id, task_id) VALUES ($1, $2)`,
          [project.id, taskResult.rows[0].id]
        );
        itemsPendingMapping.push({
          offerItemId: offerItem.id,
          description: offerItem.description,
          taskId: taskResult.rows[0].id,
        });
      }
    }

    for (const childItem of childItems) {
      const parentProjectItemId = childItem.parent_item_id
        ? offerItemIdToProjectItemId[childItem.parent_item_id] || null
        : null;

      const masterItemResult = await client.query(
        `SELECT mi.id, mi.item_code FROM master_items mi
         INNER JOIN products p ON p.product_code = mi.item_code
         WHERE p.id = $1
         LIMIT 1`,
        [childItem.product_id]
      );

      if (masterItemResult.rows.length > 0) {
        const masterItem = masterItemResult.rows[0];
        const piResult = await client.query(
          `INSERT INTO project_items
           (project_id, project_code, item_id, quantity, estimated_cost, notes, status, source,
            parent_project_item_id,
            source_offer_id, source_offer_item_id, source_order_number, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Not Started', 'sales_offer', $7, $8, $9, $10, NOW(), NOW())
           ON CONFLICT (source_order_number, source_offer_item_id)
             WHERE source_order_number IS NOT NULL AND source_offer_item_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            project.id, operationalCode, masterItem.id,
            childItem.quantity, childItem.total_price,
            childItem.description,
            parentProjectItemId,
            offerId, childItem.id, orderNumber
          ]
        );
        if (piResult.rows.length > 0) {
          offerItemIdToProjectItemId[childItem.id] = piResult.rows[0].id;
          itemsCreated++;
        }
      } else {
        const taskResult = await client.query(
          `INSERT INTO tasks
           (title, description, status, priority, assigned_to, created_by, due_date, created_at, updated_at)
           VALUES ($1, $2, 'pending', 'high', $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          [
            `Map offer child item to master item: ${(childItem.description || '').substring(0, 80)}`,
            `Offer ${offer.offer_number} child item #${childItem.id} (${childItem.product_code || 'no code'}) "${childItem.description}" needs to be mapped to a master item. Parent offer item: #${childItem.parent_item_id}. EPC project: ${operationalCode}. Order: ${orderNumber}`,
            epcParams.managerId, userId,
            epcParams.startDate
          ]
        );
        await client.query(
          `INSERT INTO project_tasks (project_id, task_id) VALUES ($1, $2)`,
          [project.id, taskResult.rows[0].id]
        );
        itemsPendingMapping.push({
          offerItemId: childItem.id,
          description: childItem.description,
          taskId: taskResult.rows[0].id,
        });
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
        operationalCode,
        itemsCreated,
        itemsPendingMapping: itemsPendingMapping.length,
        convertedBy: userId,
      })]
    );

    await client.query(
      `UPDATE offer_conversion_snapshots SET conversion_status = 'completed' WHERE id = $1`,
      [snapshotId]
    );

    const confirmedArtifactId = await freezeConfirmedArtifact(offerId, offer.revision || 0);
    if (!confirmedArtifactId) {
      console.warn(`[offer-conversion] No combined PDF artifact found for offer ${offer.offer_number} rev ${offer.revision || 0} — EPC attachment skipped. Generate the PDF before confirming.`);
    }

    await client.query('COMMIT');

    if (confirmedArtifactId) {
      const primaryArtifactId = confirmedArtifactId;
      try {
        const baselineLabel = `Baseline Order — ${orderNumber}`;
        const attachResult = await attachConfirmedArtifactToEpc(
          primaryArtifactId, project.id, operationalCode, offerId, offer.offer_number, userId, baselineLabel
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
              projectId: project.id, operationalCode, error: attachResult.error,
            })]
          );
          const { createEpcTask } = await import('./epc-task-helpers');
          await createEpcTask({
            projectId: project.id, entityType: 'project', recordId: project.id,
            actionCode: 'quotation_pdf_attachment_repair',
            title: `Quotation PDF attachment failed for project ${operationalCode}`,
            description: `The confirmed quotation PDF (artifact #${primaryArtifactId}) could not be attached to the EPC project. Error: ${attachResult.error}. Manual repair required.`,
            assignedTo: epcParams.managerId, createdBy: userId, priority: 'Medium', dueDays: 2,
          });
        }
      } catch (attachErr: any) {
        console.error(`[offer-conversion] EPC attachment error for artifact ${primaryArtifactId}:`, attachErr);
      }
    }

    const updatedOffer = await pool.query(`SELECT * FROM offers WHERE id = $1`, [offerId]);

    return {
      offer: updatedOffer.rows[0],
      project: {
        id: project.id,
        operationalCode: project.operational_code,
        name: project.name,
        status: project.status,
      },
      orderNumber,
      snapshotId,
      conversionId,
      itemsCreated,
      itemsPendingMapping,
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
