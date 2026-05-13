/**
 * PLC Escalation Job — Phase 4
 * Scheduled background scanner for overdue delivery, stale POG approvals,
 * pending GRN inspections, and expiring rate contracts.
 *
 * Pattern: setInterval, consistent with existing project scheduler approach.
 * Registered once at server startup via setupPlcEscalationJob().
 */

import {
  runDeliveryOverdueScan,
  runPogApprovalStaleScan,
  runGrnInspectionStaleScan,
  runRateContractExpiryScan,
} from './plc-notification-service';

const SIX_HOURS_MS  = 6  * 60 * 60 * 1000;
const ONE_DAY_MS    = 24 * 60 * 60 * 1000;

async function runAllScans(): Promise<void> {
  const tag = '[PLC-ESCALATION]';
  const start = Date.now();
  console.log(`${tag} Starting escalation scan at ${new Date().toISOString()}`);

  try {
    const [overdue, stale, grn, rc] = await Promise.allSettled([
      runDeliveryOverdueScan(),
      runPogApprovalStaleScan(),
      runGrnInspectionStaleScan(),
      runRateContractExpiryScan(),
    ]);

    if (overdue.status === 'fulfilled') {
      console.log(`${tag} Delivery overdue: scanned=${overdue.value.scanned}, notified=${overdue.value.notified}`);
    } else {
      console.error(`${tag} Delivery overdue scan failed:`, overdue.reason);
    }

    if (stale.status === 'fulfilled') {
      console.log(`${tag} POG stale approvals: scanned=${stale.value.scanned}, notified=${stale.value.notified}`);
    } else {
      console.error(`${tag} POG stale scan failed:`, stale.reason);
    }

    if (grn.status === 'fulfilled') {
      console.log(`${tag} GRN pending inspection: scanned=${grn.value.scanned}, notified=${grn.value.notified}`);
    } else {
      console.error(`${tag} GRN inspection stale scan failed:`, grn.reason);
    }

    if (rc.status === 'fulfilled') {
      console.log(`${tag} Rate contract expiry: scanned=${rc.value.scanned}, notified=${rc.value.notified}`);
    } else {
      console.error(`${tag} Rate contract expiry scan failed:`, rc.reason);
    }

    console.log(`${tag} Scan complete in ${Date.now() - start}ms`);
  } catch (err) {
    console.error(`${tag} Unexpected error in escalation scan:`, err);
  }
}

export function setupPlcEscalationJob(): void {
  console.log('[PLC-ESCALATION] Scheduling escalation job (6h interval for overdue; 24h for POG/GRN stale)');

  // Run once on startup after a 60s delay (let server fully initialise)
  setTimeout(async () => {
    await runAllScans();
  }, 60_000);

  // Delivery overdue + rate contract: every 6 hours
  setInterval(async () => {
    try {
      const [overdue, rc] = await Promise.allSettled([
        runDeliveryOverdueScan(),
        runRateContractExpiryScan(),
      ]);
      if (overdue.status === 'fulfilled') {
        console.log(`[PLC-ESCALATION] 6h scan — overdue: ${overdue.value.notified} alerts`);
      }
      if (rc.status === 'fulfilled') {
        console.log(`[PLC-ESCALATION] 6h scan — rate contract: ${rc.value.notified} alerts`);
      }
    } catch (err) {
      console.error('[PLC-ESCALATION] 6h scan error:', err);
    }
  }, SIX_HOURS_MS);

  // POG stale + GRN stale: every 24 hours
  setInterval(async () => {
    try {
      const [stale, grn] = await Promise.allSettled([
        runPogApprovalStaleScan(),
        runGrnInspectionStaleScan(),
      ]);
      if (stale.status === 'fulfilled') {
        console.log(`[PLC-ESCALATION] 24h scan — POG stale: ${stale.value.notified} alerts`);
      }
      if (grn.status === 'fulfilled') {
        console.log(`[PLC-ESCALATION] 24h scan — GRN stale: ${grn.value.notified} alerts`);
      }
    } catch (err) {
      console.error('[PLC-ESCALATION] 24h scan error:', err);
    }
  }, ONE_DAY_MS);
}

/**
 * Refresh procurement_cockpit_summary materialized view.
 * Called: (a) on demand via API, (b) every 5 minutes by scheduler.
 */
export async function refreshCockpitSummary(): Promise<void> {
  const { pool } = await import('./db');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY procurement_cockpit_summary');
}

const FIVE_MIN_MS = 5 * 60 * 1000;

export function setupCockpitSummaryRefresh(): void {
  console.log('[PLC-ESCALATION] Scheduling cockpit summary refresh (5-min interval)');

  // Initial refresh 30s after startup
  setTimeout(async () => {
    try { await refreshCockpitSummary(); } catch (err) {
      console.warn('[PLC-ESCALATION] Initial cockpit summary refresh skipped:', (err as Error).message);
    }
  }, 30_000);

  setInterval(async () => {
    try { await refreshCockpitSummary(); } catch (err) {
      console.warn('[PLC-ESCALATION] Cockpit summary refresh error:', (err as Error).message);
    }
  }, FIVE_MIN_MS);
}
