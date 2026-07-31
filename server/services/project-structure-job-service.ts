/**
 * project-structure-job-service.ts
 *
 * Enqueues a CREATE_PROJECT_STRUCTURE Windows Agent job after a new SOR
 * project row is committed to the database.
 *
 * Called from both project-creation paths (after transaction commit):
 *   - POST /api/projects           (server/project-routes.ts)
 *   - executeOfferConversion()     (server/offer-conversion.ts)
 *
 * Policy:
 *   - Failure is NON-BLOCKING: errors are logged but never thrown to the caller.
 *   - Only enqueues for project_type = 'SOR' with a valid status and tokens.
 *   - Prevents duplicate pending/claimed jobs for the same project.
 *   - Snapshots the full folder list into input_payload so retries are stable.
 *   - The Windows Agent never queries the ERP database — it reads only input_payload.
 */

import { db } from '../db';
import {
  documentAgentJobs,
  projectFolderTemplates,
  projectFolderTemplateItems,
  projects,
  customers,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { buildCustToken } from '../utils/cust-token';

const SERVICE = '[ProjectStructureJob]';

// Statuses that block a duplicate enqueue
const ACTIVE_STATUSES = ['pending', 'claimed'] as const;

// Statuses that disqualify a project
const INELIGIBLE_STATUSES = ['draft', 'cancelled', 'on_hold'];

export async function enqueueProjectStructureJob(
  projectId: number,
  userId: number,
): Promise<void> {
  try {
    // ── 1. Load project + customer (single JOIN) ───────────────────────────
    const rows = await db
      .select({
        id:            projects.id,
        projectType:   projects.projectType,
        status:        projects.status,
        continentCode: projects.continentCode,
        countryCode:   projects.countryCode,
        fyCode:        projects.fyCode,
        projectSeq:    projects.projectSeq,
        bpCode:        customers.bpCode,
        bpName:        customers.bpName,
      })
      .from(projects)
      .leftJoin(customers, eq(projects.customerId, customers.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    if (rows.length === 0) {
      console.warn(`${SERVICE} Project #${projectId} not found — skipping`);
      return;
    }
    const row = rows[0];

    // ── 2. Eligibility check ───────────────────────────────────────────────
    // No project_type restriction — any project with the required path tokens is eligible.
    if (INELIGIBLE_STATUSES.includes(row.status ?? '')) {
      console.log(`${SERVICE} Project #${projectId} status=${row.status} — ineligible, skipping`);
      return;
    }
    if (!row.continentCode || !row.countryCode || !row.fyCode || !row.projectSeq) {
      console.warn(`${SERVICE} Project #${projectId} missing path token(s) — CC=${row.continentCode} CO=${row.countryCode} FY=${row.fyCode} NNN=${row.projectSeq} — skipping`);
      return;
    }
    if (!row.bpCode) {
      console.warn(`${SERVICE} Project #${projectId} customer bp_code is missing — skipping`);
      return;
    }

    const custToken = buildCustToken(row.bpCode, row.bpName ?? '');

    // ── 3. Duplicate active-job check ──────────────────────────────────────
    const existing = await db
      .select({ id: documentAgentJobs.id, status: documentAgentJobs.status })
      .from(documentAgentJobs)
      .where(
        and(
          eq(documentAgentJobs.jobType, 'CREATE_PROJECT_STRUCTURE'),
          eq(documentAgentJobs.sourceModule, 'epc'),
          eq(documentAgentJobs.sourceRecordId, projectId),
          inArray(documentAgentJobs.status, [...ACTIVE_STATUSES]),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`${SERVICE} Active job #${existing[0].id} (${existing[0].status}) already exists for project #${projectId} — skipping`);
      return;
    }

    // ── 4. Load active EPC_STANDARD_V1 template ───────────────────────────
    const [template] = await db
      .select()
      .from(projectFolderTemplates)
      .where(
        and(
          eq(projectFolderTemplates.templateCode, 'EPC_STANDARD_V1'),
          eq(projectFolderTemplates.isActive, true),
        )
      )
      .limit(1);

    if (!template) {
      console.warn(`${SERVICE} No active EPC_STANDARD_V1 template found — skipping project #${projectId}`);
      return;
    }

    // ── 5. Load all active template folder paths ───────────────────────────
    const items = await db
      .select({ relativePath: projectFolderTemplateItems.relativePath })
      .from(projectFolderTemplateItems)
      .where(
        and(
          eq(projectFolderTemplateItems.templateId, template.id),
          eq(projectFolderTemplateItems.isActive, true),
        )
      )
      .orderBy(projectFolderTemplateItems.sortOrder);

    if (items.length === 0) {
      console.warn(`${SERVICE} Template EPC_STANDARD_V1 has no active folder items — skipping project #${projectId}`);
      return;
    }

    // ── 6. Validate and normalise folder paths ─────────────────────────────
    const folders: string[] = [];
    for (const item of items) {
      const p = (item.relativePath ?? '').trim().replace(/\/$/, ''); // strip trailing slash
      if (!p) continue;
      // Reject unsafe paths before snapshotting
      if (/\.\./.test(p) || /^[a-zA-Z]:/.test(p) || /^[/\\]/.test(p) || /\{[^}]+\}/.test(p)) {
        console.warn(`${SERVICE} Unsafe template path skipped: "${p}"`);
        continue;
      }
      folders.push(p);
    }

    if (folders.length === 0) {
      console.warn(`${SERVICE} No valid folder paths after validation — skipping project #${projectId}`);
      return;
    }

    // ── 7. Resolve project root relative_path (no trailing slash) ─────────
    // Format: TPEL/PROJECTS/{CC}/{CO}/{Cust}/{FY}/SOR_{NNN}
    // project_seq stores just the numeric portion e.g. "018"; "SOR_" is a fixed prefix
    // for all projects — project_type stores a label ("Re-refining Plant") not a code.
    const relativePath = `TPEL/PROJECTS/${row.continentCode}/${row.countryCode}/${custToken}/${row.fyCode}/SOR_${row.projectSeq}`;

    // ── 8. Snapshot into input_payload ────────────────────────────────────
    const inputPayload = {
      templateCode:    template.templateCode,
      templateVersion: template.version,
      folders,
    };

    // ── 9. Insert job row ──────────────────────────────────────────────────
    const [job] = await db
      .insert(documentAgentJobs)
      .values({
        jobType:        'CREATE_PROJECT_STRUCTURE',
        status:         'pending',
        relativePath,
        inputPayload,
        sourceModule:   'epc',
        sourceRecordId: projectId,
        sourceRef:      row.projectSeq,
        createdBy:      userId,
      })
      .returning({ id: documentAgentJobs.id });

    console.log(`${SERVICE} Enqueued job #${job.id} for project #${projectId} — root: ${relativePath} — ${folders.length} folders`);
  } catch (err: any) {
    // Non-blocking: project creation must never fail because of this service
    console.error(`${SERVICE} Failed to enqueue for project #${projectId}: ${err.message}`);
  }
}
