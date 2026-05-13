/**
 * PLC Notification Service
 * Phase 4 — Notification / Event Governance (Baseline §21)
 *
 * All 14 PLC notification event types wired to the existing `notifications` table
 * via `createNotification` from server/notification-routes.ts.
 *
 * Delivery: in-app for all; SendGrid email for `urgent` + `high` priority
 * recipients who have email configured (handled by existing email layer).
 */

import { pool } from './db';
import { createNotification } from './notification-routes';

// ─── Internal helpers ───────────────────────────────────────────────────────

async function getProjectManagers(projectId: number): Promise<number[]> {
  const res = await pool.query<{ user_id: number }>(
    `SELECT DISTINCT pm.user_id FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
       AND (u.role IN ('Superuser','GM','SM') OR pm.role_in_project = 'manager')`,
    [projectId],
  );
  return res.rows.map(r => r.user_id);
}

async function getAllManagers(): Promise<number[]> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE role IN ('Superuser','GM','SM') AND is_active = true`,
  );
  return res.rows.map(r => r.id);
}

async function getQualityManagers(): Promise<number[]> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE (role IN ('Superuser','GM','SM') OR department = 'Quality')
     AND is_active = true`,
  );
  return res.rows.map(r => r.id);
}

async function getProcurementAdmins(): Promise<number[]> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE department IN ('Procurement','Purchase')
     AND is_active = true`,
  );
  return res.rows.map(r => r.id);
}

async function notifyMany(
  userIds: number[],
  data: Omit<Parameters<typeof createNotification>[0], 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.allSettled(unique.map(userId => createNotification({ ...data, userId })));
}

// ─── Event 1: PR Raised ─────────────────────────────────────────────────────

export async function notifyPlcPrRaised(
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  raisedBy: number,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.pr_raised',
    title: 'Purchase Requisition Raised',
    message: `PR raised for PLC line ${plcNumber}. Vendor selection required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: 'medium',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: raisedBy,
  });
}

// ─── Event 2: POG Approval Pending ─────────────────────────────────────────

export async function notifyPlcPogApprovalPending(
  pogId: number,
  projectId: number,
  pogRef: string,
  submittedBy: number,
): Promise<void> {
  const managers = await getAllManagers();
  await notifyMany(managers, {
    type: 'plc.pog_approval_pending',
    title: 'PO Group Awaiting Approval',
    message: `PO Group ${pogRef} has been submitted and requires Manager approval.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&pogId=${pogId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'po_group',
    sourceId: pogId,
    createdBy: submittedBy,
  });
}

// ─── Event 3: POG Rejected ──────────────────────────────────────────────────

export async function notifyPlcPogRejected(
  pogId: number,
  projectId: number,
  pogRef: string,
  creatorId: number,
  rejectedBy: number,
  reason: string,
): Promise<void> {
  await createNotification({
    userId: creatorId,
    type: 'plc.pog_rejected',
    title: 'PO Group Rejected',
    message: `PO Group ${pogRef} was rejected: ${reason}`,
    link: `/epc/procurement-list-control?projectId=${projectId}&pogId=${pogId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'po_group',
    sourceId: pogId,
    createdBy: rejectedBy,
  });
}

// ─── Event 4: PO Issued ─────────────────────────────────────────────────────

export async function notifyPlcPoIssued(
  epcPoId: number,
  projectId: number,
  poNumber: string,
  creatorId: number,
  issuedBy: number,
): Promise<void> {
  const recipients = [...new Set([creatorId])];
  await notifyMany(recipients, {
    type: 'plc.po_issued',
    title: 'EPC Purchase Order Issued',
    message: `Purchase Order ${poNumber} has been issued and sent to vendor.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&poId=${epcPoId}`,
    priority: 'medium',
    category: 'procurement',
    sourceType: 'epc_po',
    sourceId: epcPoId,
    createdBy: issuedBy,
  });
}

// ─── Event 5: Delivery Overdue ──────────────────────────────────────────────

export async function notifyPlcDeliveryOverdue(
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  tagNo: string,
  daysLate: number,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.delivery_overdue',
    title: 'Procurement Delivery Overdue',
    message: `Line ${plcNumber} (${tagNo}) is ${daysLate} day${daysLate !== 1 ? 's' : ''} overdue. Material not yet fully received.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: undefined,
  });
}

// ─── Event 6: GRN Pending Inspection ───────────────────────────────────────

export async function notifyPlcGrnPendingInspection(
  grnId: number,
  projectId: number,
  grnNumber: string,
  plcNumber: string,
  createdBy: number,
): Promise<void> {
  const qualityManagers = await getQualityManagers();
  await notifyMany(qualityManagers, {
    type: 'plc.grn_pending_inspection',
    title: 'GRN Awaiting Inspection',
    message: `GRN ${grnNumber} for procurement line ${plcNumber} is pending incoming inspection.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&grnId=${grnId}`,
    priority: 'high',
    category: 'quality',
    sourceType: 'grn',
    sourceId: grnId,
    createdBy,
  });
}

// ─── Event 7: Inspection Failed ─────────────────────────────────────────────

export async function notifyPlcInspectionFailed(
  grnId: number,
  projectId: number,
  grnNumber: string,
  plcNumber: string,
  rejectedQty: number,
  userId: number,
): Promise<void> {
  const [procMgrs, qualMgrs] = await Promise.all([
    getProjectManagers(projectId),
    getQualityManagers(),
  ]);
  const recipients = [...new Set([...procMgrs, ...qualMgrs])];
  await notifyMany(recipients, {
    type: 'plc.inspection_failed',
    title: 'Incoming Inspection — Rejection',
    message: `GRN ${grnNumber} (line ${plcNumber}): ${rejectedQty} unit(s) rejected on inspection. NCR raised.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&grnId=${grnId}`,
    priority: 'urgent',
    category: 'quality',
    sourceType: 'grn',
    sourceId: grnId,
    createdBy: userId,
  });
}

// ─── Event 8: NCR Raised ────────────────────────────────────────────────────

export async function notifyPlcNcrRaised(
  ncrId: number,
  projectId: number,
  ncrNumber: string,
  plcNumber: string,
  severity: string,
  userId: number,
): Promise<void> {
  const [procMgrs, qualMgrs] = await Promise.all([
    getProjectManagers(projectId),
    getQualityManagers(),
  ]);
  const recipients = [...new Set([...procMgrs, ...qualMgrs])];
  await notifyMany(recipients, {
    type: 'plc.ncr_raised',
    title: `NCR Raised — ${severity.toUpperCase()} severity`,
    message: `NCR ${ncrNumber} raised for procurement line ${plcNumber}. Severity: ${severity}. Disposition required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&ncrId=${ncrId}`,
    priority: severity === 'critical' || severity === 'major' ? 'urgent' : 'high',
    category: 'quality',
    sourceType: 'ncr',
    sourceId: ncrId,
    createdBy: userId,
  });
}

// ─── Event 9: Over-procurement Requested ────────────────────────────────────

export async function notifyPlcOverProcurement(
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  overQty: number,
  requestedBy: number,
): Promise<void> {
  const managers = await getAllManagers();
  await notifyMany(managers, {
    type: 'plc.over_procurement_requested',
    title: 'Over-Procurement Requires Approval',
    message: `Line ${plcNumber}: ${overQty} unit(s) over-procured. Manager approval required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: requestedBy,
  });
}

// ─── Event 10: BUY List Revision Alert ──────────────────────────────────────

export async function notifyPlcBuyListRevisionAlert(
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  userId: number,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.buy_list_revision_alert',
    title: 'BUY List Revised After PO Issue',
    message: `BUY list item for PLC line ${plcNumber} was revised after PO was issued. Review required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: userId,
  });
}

// ─── Event 11: SAP Sync Error ────────────────────────────────────────────────

export async function notifyPlcSapSyncError(
  epcPoId: number,
  projectId: number,
  poNumber: string,
  errorDetail: string,
  userId: number,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.sap_sync_error',
    title: 'SAP B1 Sync Failed',
    message: `PO ${poNumber} could not be pushed to SAP B1: ${errorDetail.slice(0, 200)}`,
    link: `/epc/procurement-list-control?projectId=${projectId}&poId=${epcPoId}`,
    priority: 'urgent',
    category: 'procurement',
    sourceType: 'epc_po',
    sourceId: epcPoId,
    createdBy: userId,
  });
}

// ─── Event 12: SAP Reconciliation Mismatch ───────────────────────────────────

export async function notifyPlcSapMismatch(
  epcPoId: number,
  projectId: number,
  poNumber: string,
  mismatchCount: number,
  userId: number,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.sap_mismatch',
    title: 'SAP Reconciliation: Qty Mismatch Detected',
    message: `PO ${poNumber}: ${mismatchCount} line(s) have qty mismatch between THERMOPAC and SAP B1. Reconciliation required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&poId=${epcPoId}`,
    priority: 'high',
    category: 'procurement',
    sourceType: 'epc_po',
    sourceId: epcPoId,
    createdBy: userId,
  });
}

// ─── Event 13: Rate Contract Expiring ─────────────────────────────────────────

export async function notifyPlcRateContractExpiring(
  rcrId: number,
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  vendorName: string,
  validTo: string,
): Promise<void> {
  const admins = await getProcurementAdmins();
  await notifyMany(admins, {
    type: 'plc.rate_contract_expiring',
    title: 'Rate Contract Expiring Soon',
    message: `Rate contract for ${plcNumber} with ${vendorName} expires on ${validTo}. Renewal or re-negotiation required.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: 'medium',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: undefined,
  });
}

// ─── Event 14: Line Closed ────────────────────────────────────────────────────

export async function notifyPlcLineClosed(
  plcLineId: number,
  projectId: number,
  plcNumber: string,
  tagNo: string,
  closedBy: number,
  forced: boolean,
): Promise<void> {
  const managers = await getProjectManagers(projectId);
  await notifyMany(managers, {
    type: 'plc.line_closed',
    title: forced ? 'PLC Line Force-Closed (Manager Override)' : 'PLC Line Closed',
    message: `Line ${plcNumber} (${tagNo}) has been ${forced ? 'force-closed by Manager override' : 'closed — all receipt and inspection conditions met'}.`,
    link: `/epc/procurement-list-control?projectId=${projectId}&lineId=${plcLineId}`,
    priority: forced ? 'high' : 'medium',
    category: 'procurement',
    sourceType: 'plc_line',
    sourceId: plcLineId,
    createdBy: closedBy,
  });
}

// ─── Bulk escalation scanners (called by plc-escalation-job.ts) ──────────────

/**
 * Scan all projects for PLC lines past required_by_date.
 * Called nightly / every 6h by the escalation job.
 */
export async function runDeliveryOverdueScan(): Promise<{ scanned: number; notified: number }> {
  const res = await pool.query<{
    id: number; project_id: number; plc_number: string; tag_no: string; required_by_date: string;
  }>(
    `SELECT id, project_id, plc_number, tag_no, required_by_date
     FROM procurement_list_lines
     WHERE required_by_date IS NOT NULL
       AND required_by_date < CURRENT_DATE
       AND status NOT IN ('fully_received','closed','cancelled','superseded')`,
  );

  let notified = 0;
  for (const row of res.rows) {
    const daysLate = Math.floor(
      (Date.now() - new Date(row.required_by_date).getTime()) / 86_400_000,
    );
    try {
      await notifyPlcDeliveryOverdue(row.id, row.project_id, row.plc_number, row.tag_no, daysLate);
      notified++;
    } catch { /* log and continue */ }
  }
  return { scanned: res.rows.length, notified };
}

/**
 * Scan all POGs submitted but not approved within 24h.
 */
export async function runPogApprovalStaleScan(): Promise<{ scanned: number; notified: number }> {
  const res = await pool.query<{
    id: number; project_id: number; pog_number: string; submitted_at: Date; created_by: number;
  }>(
    `SELECT id, project_id, pog_number, submitted_at, submitted_by AS created_by
     FROM epc_po_groups
     WHERE status = 'submitted'
       AND submitted_at < NOW() - INTERVAL '24 hours'`,
  );

  let notified = 0;
  for (const row of res.rows) {
    try {
      await notifyPlcPogApprovalPending(row.id, row.project_id, row.pog_number, row.created_by);
      notified++;
    } catch { /* log and continue */ }
  }
  return { scanned: res.rows.length, notified };
}

/**
 * Scan GRNs pending inspection for > 48 hours.
 */
export async function runGrnInspectionStaleScan(): Promise<{ scanned: number; notified: number }> {
  const res = await pool.query<{
    id: number; project_id: number; grn_number: string; plc_number: string;
    received_date: string; created_by: number;
  }>(
    `SELECT g.id, g.project_id, g.grn_number, pl.plc_number, g.received_date, g.created_by
     FROM plc_grn_records g
     JOIN procurement_list_lines pl ON pl.id = g.plc_line_id
     WHERE g.inspection_status = 'pending'
       AND g.created_at < NOW() - INTERVAL '48 hours'`,
  );

  let notified = 0;
  for (const row of res.rows) {
    try {
      await notifyPlcGrnPendingInspection(
        row.id, row.project_id, row.grn_number, row.plc_number, row.created_by,
      );
      notified++;
    } catch { /* log and continue */ }
  }
  return { scanned: res.rows.length, notified };
}

/**
 * Scan rate contracts expiring within 30 days.
 */
export async function runRateContractExpiryScan(): Promise<{ scanned: number; notified: number }> {
  const res = await pool.query<{
    id: number; plc_line_id: number; project_id: number; vendor_name: string; valid_to: string; plc_number: string;
  }>(
    `SELECT r.id, r.plc_line_id, r.project_id, r.vendor_name, r.valid_to, pl.plc_number
     FROM plc_rate_contract_refs r
     JOIN procurement_list_lines pl ON pl.id = r.plc_line_id
     WHERE r.valid_to IS NOT NULL
       AND r.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       AND r.is_locked = false`,
  );

  let notified = 0;
  for (const row of res.rows) {
    try {
      await notifyPlcRateContractExpiring(
        row.id, row.plc_line_id, row.project_id, row.plc_number,
        row.vendor_name || 'Unknown Vendor', row.valid_to,
      );
      notified++;
    } catch { /* log and continue */ }
  }
  return { scanned: res.rows.length, notified };
}
