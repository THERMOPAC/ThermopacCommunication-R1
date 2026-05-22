import { Router } from "express";
import { db } from "./db";
import {
  oiRcaRecords, oiRcaFiveWhy, oiRcaFishbone, oiRcaFailureTreeNodes,
  oiRcaEvidence, oiRcaSimilarLinks, oiIssues, users,
} from "@shared/schema";
import { eq, and, or, count, desc, asc, lt, isNull, sql, ne, inArray } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "./oi-audit-service";
import multer from "multer";
import { gcsStorage } from "./utils/gcs-storage";

export const oiRcaRouter = Router();

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];

function actorFromReq(req: any) {
  return {
    id:   req.user.id as number,
    name: (req.user.name || req.user.username || "Unknown") as string,
    role: (req.user.role || "Employee") as string,
    ip:   (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "") as string,
  };
}

function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

const ROOT_CAUSE_CODES = [
  'DESIGN_ERROR','MANUFACTURING_DEFECT','MATERIAL_FAILURE','PROCESS_DEVIATION',
  'HUMAN_ERROR','EQUIPMENT_FAILURE','SUPPLIER_QUALITY','SPECIFICATION_GAP',
  'COMMUNICATION_FAILURE','ENVIRONMENTAL_FACTOR','SYSTEMIC_WEAKNESS',
  'INSPECTION_FAILURE','MAINTENANCE_FAILURE','SOFTWARE_ERROR','UNKNOWN',
] as const;

const ROOT_CAUSE_LABELS: Record<typeof ROOT_CAUSE_CODES[number], string> = {
  DESIGN_ERROR:           'Design Error',
  MANUFACTURING_DEFECT:   'Manufacturing Defect',
  MATERIAL_FAILURE:       'Material Failure',
  PROCESS_DEVIATION:      'Process Deviation',
  HUMAN_ERROR:            'Human Error',
  EQUIPMENT_FAILURE:      'Equipment Failure',
  SUPPLIER_QUALITY:       'Supplier Quality',
  SPECIFICATION_GAP:      'Specification Gap',
  COMMUNICATION_FAILURE:  'Communication Failure',
  ENVIRONMENTAL_FACTOR:   'Environmental Factor',
  SYSTEMIC_WEAKNESS:      'Systemic Weakness',
  INSPECTION_FAILURE:     'Inspection Failure',
  MAINTENANCE_FAILURE:    'Maintenance Failure',
  SOFTWARE_ERROR:         'Software / Configuration Error',
  UNKNOWN:                'Unknown',
};

// Allowed issue statuses for RCA creation
const RCA_ELIGIBLE_STATUSES = ['classified','investigating','verified','closed'];

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
const createRcaSchema = z.object({
  methodology:      z.enum(['five_why','fishbone','failure_tree','combined']),
  rootCauseCode:    z.enum(ROOT_CAUSE_CODES).optional().default('UNKNOWN'),
  rootCauseSummary: z.string().max(2000).optional().default(''),
  assignedTo:       z.number().int().positive().nullable().optional(),
});

const patchRcaSchema = z.object({
  rootCauseCode:       z.enum(ROOT_CAUSE_CODES).optional(),
  rootCauseSummary:    z.string().min(0).max(2000).optional(),
  contributingFactors: z.string().max(2000).nullable().optional(),
  immediateCause:      z.string().max(1000).nullable().optional(),
  underlyingCause:     z.string().max(1000).nullable().optional(),
  systemicCause:       z.string().max(1000).nullable().optional(),
  assignedTo:          z.number().int().positive().nullable().optional(),
  reviewerId:          z.number().int().positive().nullable().optional(),
  approverId:          z.number().int().positive().nullable().optional(),
});

const fiveWhyUpsertSchema = z.array(z.object({
  whyLevel:    z.number().int().min(1).max(5),
  whyQuestion: z.string().min(5).max(500),
  whyAnswer:   z.string().min(5).max(500),
})).min(1).max(5).refine(
  rows => {
    const levels = rows.map(r => r.whyLevel).sort((a, b) => a - b);
    return levels.every((v, i) => v === i + 1);
  },
  { message: 'why_level values must be consecutive starting from 1' }
);

const fishboneCauseSchema = z.object({
  category:         z.enum(['man','machine','material','method','measurement','environment']),
  causeDescription: z.string().min(5).max(500),
  isPrimaryCause:   z.boolean().optional().default(false),
});

const fishbonePatchSchema = z.object({
  category:         z.enum(['man','machine','material','method','measurement','environment']).optional(),
  causeDescription: z.string().min(5).max(500).optional(),
  isPrimaryCause:   z.boolean().optional(),
});

const failureTreeNodeSchema = z.object({
  nodeType:      z.enum(['top_event','intermediate_event','basic_event','and_gate','or_gate']),
  nodeLabel:     z.string().min(3).max(200),
  parentId:      z.number().int().positive().nullable().optional(),
  nodeNote:      z.string().max(500).nullable().optional(),
  sequenceOrder: z.number().int().min(0).optional().default(0),
});

const failureTreePatchSchema = z.object({
  nodeLabel:     z.string().min(3).max(200).optional(),
  nodeNote:      z.string().max(500).nullable().optional(),
  sequenceOrder: z.number().int().min(0).optional(),
});

const correlationLinkSchema = z.object({
  partnerIssueId: z.number().int().positive(),
  linkType:       z.enum(['same_root_cause','related_cause','recurrence','pattern']),
  linkNote:       z.string().max(500).nullable().optional(),
});

const rejectSchema = z.object({
  rejection_reason: z.string().min(10).max(1000),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchRcaWithOwnerCheck(
  issueId: number, rcaId: number, actorRole: string
): Promise<typeof oiRcaRecords.$inferSelect | null> {
  if (!hasRole(actorRole, MANAGER_ROLES)) return null;
  const [rca] = await db.select().from(oiRcaRecords)
    .where(and(eq(oiRcaRecords.id, rcaId), eq(oiRcaRecords.issueId, issueId)));
  return rca ?? null;
}

async function getUserDisplayName(userId: number | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  return u ? (u.name || u.username || null) : null;
}

async function getRcaSubCounts(rcaId: number) {
  const [fwCount, fbCount, ftCount, evCount] = await Promise.all([
    db.select({ n: count() }).from(oiRcaFiveWhy).where(eq(oiRcaFiveWhy.rcaId, rcaId)),
    db.select({ n: count() }).from(oiRcaFishbone).where(eq(oiRcaFishbone.rcaId, rcaId)),
    db.select({ n: count() }).from(oiRcaFailureTreeNodes).where(eq(oiRcaFailureTreeNodes.rcaId, rcaId)),
    db.select({ n: count() }).from(oiRcaEvidence).where(eq(oiRcaEvidence.rcaId, rcaId)),
  ]);
  return {
    fiveWhyCount:      Number(fwCount[0]?.n ?? 0),
    fishboneCount:     Number(fbCount[0]?.n ?? 0),
    failureTreeCount:  Number(ftCount[0]?.n ?? 0),
    evidenceCount:     Number(evCount[0]?.n ?? 0),
  };
}

// ─── Multer for evidence upload ───────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function safeName(filename: string): string {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._\-]/g, '');
}

// ─── RCA CRUD ─────────────────────────────────────────────────────────────────

// POST /api/oi/issues/:id/rca
oiRcaRouter.post("/issues/:id/rca", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, issueId));
  if (!issue) return res.status(404).json({ error: "issue_not_found" });
  if (!RCA_ELIGIBLE_STATUSES.includes(issue.status)) {
    return res.status(422).json({ error: "issue_status_ineligible", message: "RCA can only be created for issues in classified, investigating, verified, or closed status" });
  }

  const parsed = createRcaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  // Validate assignedTo user if provided
  if (parsed.data.assignedTo) {
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, parsed.data.assignedTo)).limit(1);
    if (!u) return res.status(422).json({ error: "assigned_user_not_found" });
    if (!hasRole(u.role, MANAGER_ROLES)) return res.status(422).json({ error: "assigned_user_must_be_manager_or_above" });
  }

  // One RCA per issue
  const [existing] = await db.select({ id: oiRcaRecords.id }).from(oiRcaRecords).where(eq(oiRcaRecords.issueId, issueId));
  if (existing) return res.status(409).json({ error: "rca_already_exists" });

  const [rca] = await db.insert(oiRcaRecords).values({
    issueId,
    methodology:      parsed.data.methodology,
    rootCauseCode:    parsed.data.rootCauseCode ?? 'UNKNOWN',
    rootCauseSummary: parsed.data.rootCauseSummary ?? '',
    assignedTo:       parsed.data.assignedTo ?? null,
    status:           'draft',
    revisionNumber:   1,
    createdBy:        actor.id,
  }).returning();

  await writeAuditLog({ issueId, action: 'rca_created', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rca.id}`, ipAddress: actor.ip });
  return res.status(201).json(rca);
});

// GET /api/oi/issues/:id/rca
oiRcaRouter.get("/issues/:id/rca", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const [rca] = await db.select().from(oiRcaRecords).where(eq(oiRcaRecords.issueId, issueId));
  if (!rca) return res.status(404).json({ error: "not_found" });

  const [assignedToName, reviewerName, approverName, createdByName, counts] = await Promise.all([
    getUserDisplayName(rca.assignedTo),
    getUserDisplayName(rca.reviewerId),
    getUserDisplayName(rca.approverId),
    getUserDisplayName(rca.createdBy),
    getRcaSubCounts(rca.id),
  ]);

  return res.json({
    ...rca,
    assignedToName,
    reviewerName,
    approverName,
    createdByName,
    rootCauseLabel: ROOT_CAUSE_LABELS[rca.rootCauseCode as typeof ROOT_CAUSE_CODES[number]] ?? rca.rootCauseCode,
    ...counts,
  });
});

// PATCH /api/oi/issues/:id/rca/:rcaId
oiRcaRouter.patch("/issues/:id/rca/:rcaId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable", message: "RCA can only be edited in draft or rejected state" });

  const isOwnerOrCreator = (actor.id === rca.createdBy || actor.id === rca.assignedTo);
  if (!isOwnerOrCreator && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const parsed = patchRcaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  // SM+ only fields
  const smOnlyFields = ['reviewerId', 'approverId'];
  const hasSmFields = smOnlyFields.some(f => req.body[f] !== undefined);
  if (hasSmFields && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden_sm_fields" });

  // Validate assignedTo user if provided
  if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== null) {
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, parsed.data.assignedTo!)).limit(1);
    if (!u) return res.status(422).json({ error: "assigned_user_not_found" });
    if (!hasRole(u.role, MANAGER_ROLES)) return res.status(422).json({ error: "assigned_user_must_be_manager_or_above" });
  }

  const immutable = new Set(['id','issueId','status','methodology','revisionNumber','createdBy','createdAt','submittedAt','reviewStartedAt','approvedAt','rejectedAt','rejectionReason']);
  const updates: Record<string, any> = {};

  for (const [key, val] of Object.entries(parsed.data)) {
    if (immutable.has(key)) continue;
    if (!hasRole(actor.role, SM_ROLES) && smOnlyFields.includes(key)) continue;
    const oldVal = String((rca as any)[key] ?? '');
    const newVal = String(val ?? '');
    if (oldVal === newVal) continue;
    updates[key] = val;
    await writeAuditLog({ issueId, action: 'field_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: `rca.${key}`, oldValue: oldVal, newValue: newVal, context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  }

  if (Object.keys(updates).length === 0) return res.json(rca);

  const [updated] = await db.update(oiRcaRecords).set({ ...updates, updatedAt: new Date() }).where(eq(oiRcaRecords.id, rcaId)).returning();
  return res.json(updated);
});

// DELETE /api/oi/issues/:id/rca/:rcaId
oiRcaRouter.delete("/issues/:id/rca/:rcaId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft') return res.status(409).json({ error: "rca_can_only_be_deleted_in_draft_state" });

  await db.delete(oiRcaRecords).where(eq(oiRcaRecords.id, rcaId));
  await writeAuditLog({ issueId, action: 'rca_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  return res.status(204).end();
});

// ─── Workflow Transitions ─────────────────────────────────────────────────────

// POST /api/oi/issues/:id/rca/:rcaId/submit
oiRcaRouter.post("/issues/:id/rca/:rcaId/submit", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft') return res.status(409).json({ error: "transition_not_permitted", message: "Transition not permitted from current state" });

  const isOwnerOrCreator = (actor.id === rca.createdBy || actor.id === rca.assignedTo);
  if (!isOwnerOrCreator && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  if ((rca.rootCauseSummary ?? '').trim().length < 20) return res.status(422).json({ error: "root_cause_summary_too_short" });

  // Check sub-table requirements
  const [fwCount, fbCount, ftTopCount] = await Promise.all([
    db.select({ n: count() }).from(oiRcaFiveWhy).where(eq(oiRcaFiveWhy.rcaId, rcaId)),
    db.select({ n: count() }).from(oiRcaFishbone).where(eq(oiRcaFishbone.rcaId, rcaId)),
    db.select({ n: count() }).from(oiRcaFailureTreeNodes).where(and(eq(oiRcaFailureTreeNodes.rcaId, rcaId), eq(oiRcaFailureTreeNodes.isTopEvent, true))),
  ]);
  const m = rca.methodology;
  if ((m === 'five_why') && Number(fwCount[0]?.n) < 1) return res.status(422).json({ error: "five_why_rows_required" });
  if ((m === 'fishbone') && Number(fbCount[0]?.n) < 1) return res.status(422).json({ error: "fishbone_causes_required" });
  if ((m === 'failure_tree') && Number(ftTopCount[0]?.n) < 1) return res.status(422).json({ error: "failure_tree_top_event_required" });
  if (m === 'combined') {
    const any = Number(fwCount[0]?.n) + Number(fbCount[0]?.n) + Number(ftTopCount[0]?.n);
    if (any < 1) return res.status(422).json({ error: "combined_requires_at_least_one_sub_table_row" });
  }

  const [updated] = await db.update(oiRcaRecords).set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() }).where(eq(oiRcaRecords.id, rcaId)).returning();
  await writeAuditLog({ issueId, action: 'status_changed', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: 'rca_status', oldValue: 'draft', newValue: 'submitted', context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// POST /api/oi/issues/:id/rca/:rcaId/start-review
oiRcaRouter.post("/issues/:id/rca/:rcaId/start-review", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'submitted') return res.status(409).json({ error: "transition_not_permitted", message: "Transition not permitted from current state" });

  const [updated] = await db.update(oiRcaRecords).set({ status: 'under_review', reviewStartedAt: new Date(), updatedAt: new Date() }).where(eq(oiRcaRecords.id, rcaId)).returning();
  await writeAuditLog({ issueId, action: 'status_changed', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: 'rca_status', oldValue: 'submitted', newValue: 'under_review', context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// POST /api/oi/issues/:id/rca/:rcaId/approve
oiRcaRouter.post("/issues/:id/rca/:rcaId/approve", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'under_review') return res.status(409).json({ error: "transition_not_permitted", message: "Transition not permitted from current state" });
  if (rca.assignedTo !== null && actor.id === rca.assignedTo) return res.status(422).json({ error: "approver_cannot_be_assignee" });
  if (rca.rootCauseCode === 'UNKNOWN') return res.status(422).json({ error: "root_cause_code_must_not_be_unknown" });
  if ((rca.rootCauseSummary ?? '').trim().length < 20) return res.status(422).json({ error: "root_cause_summary_too_short" });

  const [updated] = await db.update(oiRcaRecords).set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() }).where(eq(oiRcaRecords.id, rcaId)).returning();
  await writeAuditLog({ issueId, action: 'status_changed', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: 'rca_status', oldValue: 'under_review', newValue: 'approved', context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// POST /api/oi/issues/:id/rca/:rcaId/reject
oiRcaRouter.post("/issues/:id/rca/:rcaId/reject", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'submitted' && rca.status !== 'under_review') return res.status(409).json({ error: "transition_not_permitted", message: "Transition not permitted from current state" });

  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [updated] = await db.update(oiRcaRecords).set({
    status: 'rejected', rejectedAt: new Date(), rejectionReason: parsed.data.rejection_reason, updatedAt: new Date(),
  }).where(eq(oiRcaRecords.id, rcaId)).returning();
  await writeAuditLog({ issueId, action: 'status_changed', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: 'rca_status', oldValue: rca.status, newValue: 'rejected', context: `RCA ID ${rcaId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// POST /api/oi/issues/:id/rca/:rcaId/reopen
oiRcaRouter.post("/issues/:id/rca/:rcaId/reopen", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'rejected') return res.status(409).json({ error: "transition_not_permitted", message: "Transition not permitted from current state" });

  const isOwnerOrCreator = (actor.id === rca.createdBy || actor.id === rca.assignedTo);
  if (!isOwnerOrCreator && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  // Phase 1D gate: block RCA reopen if any linked CAPA is active (not draft or cancelled)
  {
    const { oiCapaRecords } = await import("@shared/schema");
    const { not: drNot, inArray: drInArray } = await import("drizzle-orm");
    const activeCapa = await db.select({ id: oiCapaRecords.id, capaNumber: oiCapaRecords.capaNumber })
      .from(oiCapaRecords)
      .where(and(eq(oiCapaRecords.rcaId, rcaId), drNot(drInArray(oiCapaRecords.status, ['draft','cancelled']))))
      .limit(1);
    if (activeCapa.length) {
      return res.status(409).json({ error: "active_capa_exists", message: `CAPA ${activeCapa[0].capaNumber} is active. Cancel or close all CAPAs linked to this RCA before reopening.` });
    }
  }

  const newRevision = rca.revisionNumber + 1;
  const [updated] = await db.update(oiRcaRecords).set({
    status: 'draft', revisionNumber: newRevision,
    rejectedAt: null, rejectionReason: null,
    submittedAt: null, reviewStartedAt: null,
    updatedAt: new Date(),
  }).where(eq(oiRcaRecords.id, rcaId)).returning();
  await writeAuditLog({ issueId, action: 'rca_reopened', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} rev ${newRevision}`, ipAddress: actor.ip });
  return res.json(updated);
});

// ─── 5 Why Endpoints ──────────────────────────────────────────────────────────

// GET /api/oi/issues/:id/rca/:rcaId/five-why
oiRcaRouter.get("/issues/:id/rca/:rcaId/five-why", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });

  const rows = await db.select().from(oiRcaFiveWhy).where(eq(oiRcaFiveWhy.rcaId, rcaId)).orderBy(asc(oiRcaFiveWhy.whyLevel));
  return res.json(rows);
});

// POST /api/oi/issues/:id/rca/:rcaId/five-why
oiRcaRouter.post("/issues/:id/rca/:rcaId/five-why", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const isOwnerOrCreator = (actor.id === rca.createdBy || actor.id === rca.assignedTo);
  if (!isOwnerOrCreator && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const parsed = fiveWhyUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  // Full replace in a transaction
  await db.transaction(async (tx) => {
    await tx.delete(oiRcaFiveWhy).where(eq(oiRcaFiveWhy.rcaId, rcaId));
    await tx.insert(oiRcaFiveWhy).values(parsed.data.map(row => ({ rcaId, whyLevel: row.whyLevel, whyQuestion: row.whyQuestion, whyAnswer: row.whyAnswer })));
  });

  await writeAuditLog({ issueId, action: 'five_why_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} rowCount=${parsed.data.length}`, ipAddress: actor.ip });
  const rows = await db.select().from(oiRcaFiveWhy).where(eq(oiRcaFiveWhy.rcaId, rcaId)).orderBy(asc(oiRcaFiveWhy.whyLevel));
  return res.json(rows);
});

// ─── Fishbone Endpoints ───────────────────────────────────────────────────────

// GET /api/oi/issues/:id/rca/:rcaId/fishbone
oiRcaRouter.get("/issues/:id/rca/:rcaId/fishbone", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });

  const rows = await db.select().from(oiRcaFishbone).where(eq(oiRcaFishbone.rcaId, rcaId)).orderBy(asc(oiRcaFishbone.category), asc(oiRcaFishbone.id));
  return res.json(rows);
});

// POST /api/oi/issues/:id/rca/:rcaId/fishbone
oiRcaRouter.post("/issues/:id/rca/:rcaId/fishbone", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const parsed = fishboneCauseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [row] = await db.transaction(async (tx) => {
    if (parsed.data.isPrimaryCause) {
      await tx.update(oiRcaFishbone).set({ isPrimaryCause: false }).where(and(eq(oiRcaFishbone.rcaId, rcaId), eq(oiRcaFishbone.isPrimaryCause, true)));
    }
    return tx.insert(oiRcaFishbone).values({ rcaId, category: parsed.data.category, causeDescription: parsed.data.causeDescription, isPrimaryCause: parsed.data.isPrimaryCause ?? false }).returning();
  });

  await writeAuditLog({ issueId, action: 'fishbone_cause_added', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} cause ID ${row.id}`, ipAddress: actor.ip });
  return res.status(201).json(row);
});

// PATCH /api/oi/issues/:id/rca/:rcaId/fishbone/:causeId
oiRcaRouter.patch("/issues/:id/rca/:rcaId/fishbone/:causeId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId  = parseInt(req.params.id);
  const rcaId    = parseInt(req.params.rcaId);
  const causeId  = parseInt(req.params.causeId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(causeId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const [cause] = await db.select().from(oiRcaFishbone).where(and(eq(oiRcaFishbone.id, causeId), eq(oiRcaFishbone.rcaId, rcaId)));
  if (!cause) return res.status(404).json({ error: "cause_not_found" });

  const parsed = fishbonePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [updated] = await db.transaction(async (tx) => {
    if (parsed.data.isPrimaryCause) {
      await tx.update(oiRcaFishbone).set({ isPrimaryCause: false }).where(and(eq(oiRcaFishbone.rcaId, rcaId), eq(oiRcaFishbone.isPrimaryCause, true), ne(oiRcaFishbone.id, causeId)));
    }
    return tx.update(oiRcaFishbone).set({ ...parsed.data, updatedAt: new Date() }).where(eq(oiRcaFishbone.id, causeId)).returning();
  });

  await writeAuditLog({ issueId, action: 'fishbone_cause_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} cause ID ${causeId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// DELETE /api/oi/issues/:id/rca/:rcaId/fishbone/:causeId
oiRcaRouter.delete("/issues/:id/rca/:rcaId/fishbone/:causeId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId  = parseInt(req.params.id);
  const rcaId    = parseInt(req.params.rcaId);
  const causeId  = parseInt(req.params.causeId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(causeId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const [cause] = await db.select({ id: oiRcaFishbone.id }).from(oiRcaFishbone).where(and(eq(oiRcaFishbone.id, causeId), eq(oiRcaFishbone.rcaId, rcaId)));
  if (!cause) return res.status(404).json({ error: "cause_not_found" });

  await db.delete(oiRcaFishbone).where(eq(oiRcaFishbone.id, causeId));
  await writeAuditLog({ issueId, action: 'fishbone_cause_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} cause ID ${causeId}`, ipAddress: actor.ip });
  return res.status(204).end();
});

// ─── Failure Tree Endpoints ───────────────────────────────────────────────────

// GET /api/oi/issues/:id/rca/:rcaId/failure-tree
oiRcaRouter.get("/issues/:id/rca/:rcaId/failure-tree", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });

  const nodes = await db.select().from(oiRcaFailureTreeNodes).where(eq(oiRcaFailureTreeNodes.rcaId, rcaId)).orderBy(asc(oiRcaFailureTreeNodes.id));
  return res.json(nodes);
});

// POST /api/oi/issues/:id/rca/:rcaId/failure-tree
oiRcaRouter.post("/issues/:id/rca/:rcaId/failure-tree", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const parsed = failureTreeNodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  if (parsed.data.nodeType === 'top_event') {
    if (parsed.data.parentId) return res.status(422).json({ error: "top_event_must_have_null_parent" });
    const [existing] = await db.select({ id: oiRcaFailureTreeNodes.id }).from(oiRcaFailureTreeNodes).where(and(eq(oiRcaFailureTreeNodes.rcaId, rcaId), eq(oiRcaFailureTreeNodes.isTopEvent, true)));
    if (existing) return res.status(409).json({ error: "top_event_already_exists" });
  } else {
    if (!parsed.data.parentId) return res.status(422).json({ error: "non_top_event_requires_parent_id" });
    const [parent] = await db.select({ nodeType: oiRcaFailureTreeNodes.nodeType, rcaId: oiRcaFailureTreeNodes.rcaId }).from(oiRcaFailureTreeNodes).where(eq(oiRcaFailureTreeNodes.id, parsed.data.parentId));
    if (!parent || parent.rcaId !== rcaId) return res.status(422).json({ error: "parent_node_not_found_in_this_rca" });
    if (parent.nodeType === 'basic_event') return res.status(422).json({ error: "basic_event_cannot_have_children" });
  }

  const [node] = await db.insert(oiRcaFailureTreeNodes).values({
    rcaId,
    parentId:      parsed.data.parentId ?? null,
    nodeType:      parsed.data.nodeType,
    nodeLabel:     parsed.data.nodeLabel,
    nodeNote:      parsed.data.nodeNote ?? null,
    isTopEvent:    parsed.data.nodeType === 'top_event',
    sequenceOrder: parsed.data.sequenceOrder ?? 0,
  }).returning();

  await writeAuditLog({ issueId, action: 'failure_tree_node_added', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} node ID ${node.id} type=${parsed.data.nodeType}`, ipAddress: actor.ip });
  return res.status(201).json(node);
});

// PATCH /api/oi/issues/:id/rca/:rcaId/failure-tree/:nodeId
oiRcaRouter.patch("/issues/:id/rca/:rcaId/failure-tree/:nodeId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  const nodeId  = parseInt(req.params.nodeId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(nodeId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const [node] = await db.select().from(oiRcaFailureTreeNodes).where(and(eq(oiRcaFailureTreeNodes.id, nodeId), eq(oiRcaFailureTreeNodes.rcaId, rcaId)));
  if (!node) return res.status(404).json({ error: "node_not_found" });

  const parsed = failureTreePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [updated] = await db.update(oiRcaFailureTreeNodes).set({ ...parsed.data, updatedAt: new Date() }).where(eq(oiRcaFailureTreeNodes.id, nodeId)).returning();
  await writeAuditLog({ issueId, action: 'failure_tree_node_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} node ID ${nodeId}`, ipAddress: actor.ip });
  return res.json(updated);
});

// DELETE /api/oi/issues/:id/rca/:rcaId/failure-tree/:nodeId
oiRcaRouter.delete("/issues/:id/rca/:rcaId/failure-tree/:nodeId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  const nodeId  = parseInt(req.params.nodeId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(nodeId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status !== 'draft' && rca.status !== 'rejected') return res.status(409).json({ error: "rca_not_editable" });

  const [node] = await db.select().from(oiRcaFailureTreeNodes).where(and(eq(oiRcaFailureTreeNodes.id, nodeId), eq(oiRcaFailureTreeNodes.rcaId, rcaId)));
  if (!node) return res.status(404).json({ error: "node_not_found" });

  if (node.isTopEvent) {
    const [childExists] = await db.select({ id: oiRcaFailureTreeNodes.id }).from(oiRcaFailureTreeNodes).where(eq(oiRcaFailureTreeNodes.parentId, nodeId)).limit(1);
    if (childExists) return res.status(409).json({ error: "cannot_delete_top_event_while_child_nodes_exist" });
  }

  await db.delete(oiRcaFailureTreeNodes).where(eq(oiRcaFailureTreeNodes.id, nodeId));
  await writeAuditLog({ issueId, action: 'failure_tree_node_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} node ID ${nodeId}`, ipAddress: actor.ip });
  return res.status(204).end();
});

// ─── Evidence Endpoints ───────────────────────────────────────────────────────

// GET /api/oi/issues/:id/rca/:rcaId/evidence
oiRcaRouter.get("/issues/:id/rca/:rcaId/evidence", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });

  const rows = await db.select().from(oiRcaEvidence).where(eq(oiRcaEvidence.rcaId, rcaId)).orderBy(desc(oiRcaEvidence.uploadedAt));
  return res.json(rows);
});

// POST /api/oi/issues/:id/rca/:rcaId/evidence
oiRcaRouter.post("/issues/:id/rca/:rcaId/evidence", upload.single("file"), async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const rcaId   = parseInt(req.params.rcaId);
  if (isNaN(issueId) || isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status === 'approved' || rca.status === 'rejected') return res.status(409).json({ error: "evidence_upload_not_allowed_in_current_status" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "no_file_uploaded" });

  if (file.size > 25 * 1024 * 1024) return res.status(413).json({ error: "file_too_large" });
  if (!ALLOWED_CONTENT_TYPES.has(file.mimetype)) return res.status(415).json({ error: "unsupported_content_type" });

  const [countRow] = await db.select({ n: count() }).from(oiRcaEvidence).where(eq(oiRcaEvidence.rcaId, rcaId));
  if (Number(countRow?.n ?? 0) >= 20) return res.status(422).json({ error: "evidence_limit_reached", message: "Maximum 20 evidence files per RCA" });

  const [issue] = await db.select({ projectId: oiIssues.projectId }).from(oiIssues).where(eq(oiIssues.id, issueId));
  const sn = safeName(file.originalname);
  const gcsPath = issue?.projectId
    ? `TPEL/OI/${issueId}/RCA/${rcaId}/${sn}`
    : `TPEL/OI/UNLINKED/${issueId}/RCA/${rcaId}/${sn}`;

  const result = await gcsStorage.uploadFileDirectly({ filePath: gcsPath, buffer: file.buffer, contentType: file.mimetype });
  if (!result.success) return res.status(502).json({ error: "gcs_upload_failed" });

  const [row] = await db.insert(oiRcaEvidence).values({
    rcaId, fileName: file.originalname, gcsPath, fileSizeBytes: file.size, contentType: file.mimetype, uploadedBy: actor.id,
  }).returning();

  await writeAuditLog({ issueId, action: 'rca_evidence_uploaded', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} file=${file.originalname} size=${file.size}`, ipAddress: actor.ip });
  return res.status(201).json(row);
});

// GET /api/oi/issues/:id/rca/:rcaId/evidence/:evidenceId/signed-url
oiRcaRouter.get("/issues/:id/rca/:rcaId/evidence/:evidenceId/signed-url", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId     = parseInt(req.params.id);
  const rcaId       = parseInt(req.params.rcaId);
  const evidenceId  = parseInt(req.params.evidenceId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(evidenceId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });

  const [ev] = await db.select().from(oiRcaEvidence).where(and(eq(oiRcaEvidence.id, evidenceId), eq(oiRcaEvidence.rcaId, rcaId)));
  if (!ev) return res.status(404).json({ error: "evidence_not_found" });

  const url = await gcsStorage.generateDownloadSignedUrl({ filePath: ev.gcsPath, expirationMinutes: 15 });
  if (!url) return res.status(502).json({ error: "signed_url_generation_failed" });
  return res.json({ url, expiresInMinutes: 15 });
});

// DELETE /api/oi/issues/:id/rca/:rcaId/evidence/:evidenceId
oiRcaRouter.delete("/issues/:id/rca/:rcaId/evidence/:evidenceId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId     = parseInt(req.params.id);
  const rcaId       = parseInt(req.params.rcaId);
  const evidenceId  = parseInt(req.params.evidenceId);
  if (isNaN(issueId) || isNaN(rcaId) || isNaN(evidenceId)) return res.status(400).json({ error: "invalid_id" });

  const rca = await fetchRcaWithOwnerCheck(issueId, rcaId, actor.role);
  if (!rca) return res.status(404).json({ error: "not_found" });
  if (rca.status === 'under_review' || rca.status === 'approved') return res.status(409).json({ error: "evidence_delete_not_allowed_in_current_status" });

  const [ev] = await db.select().from(oiRcaEvidence).where(and(eq(oiRcaEvidence.id, evidenceId), eq(oiRcaEvidence.rcaId, rcaId)));
  if (!ev) return res.status(404).json({ error: "evidence_not_found" });

  const isUploader = actor.id === ev.uploadedBy;
  if (!isUploader && !hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  await db.delete(oiRcaEvidence).where(eq(oiRcaEvidence.id, evidenceId));
  await writeAuditLog({ issueId, action: 'rca_evidence_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `RCA ID ${rcaId} file=${ev.fileName}`, ipAddress: actor.ip });
  return res.status(204).end();
});

// ─── Similar Issues ───────────────────────────────────────────────────────────

// GET /api/oi/issues/:id/similar
oiRcaRouter.get("/issues/:id/similar", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const [thisRca] = await db.select({ rootCauseCode: oiRcaRecords.rootCauseCode }).from(oiRcaRecords).where(eq(oiRcaRecords.issueId, issueId));
  if (!thisRca || thisRca.rootCauseCode === 'UNKNOWN') return res.json([]);

  const rows = await db
    .select({
      id:              oiIssues.id,
      issueNumber:     oiIssues.issueNumber,
      title:           oiIssues.title,
      category:        oiIssues.category,
      status:          oiIssues.status,
      severity:        oiIssues.severity,
      createdAt:       oiIssues.createdAt,
      rootCauseCode:   oiRcaRecords.rootCauseCode,
      rootCauseSummary: oiRcaRecords.rootCauseSummary,
      approvedAt:      oiRcaRecords.approvedAt,
    })
    .from(oiIssues)
    .innerJoin(oiRcaRecords, eq(oiRcaRecords.issueId, oiIssues.id))
    .where(and(
      eq(oiRcaRecords.rootCauseCode, thisRca.rootCauseCode),
      eq(oiRcaRecords.status, 'approved'),
      ne(oiIssues.id, issueId)
    ))
    .orderBy(desc(oiIssues.createdAt))
    .limit(20);

  return res.json(rows);
});

// ─── Cross-Issue Correlations ─────────────────────────────────────────────────

// GET /api/oi/issues/:id/correlations
oiRcaRouter.get("/issues/:id/correlations", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const links = await db.select().from(oiRcaSimilarLinks).where(
    or(eq(oiRcaSimilarLinks.issueIdA, issueId), eq(oiRcaSimilarLinks.issueIdB, issueId))
  );

  const result = await Promise.all(links.map(async (link) => {
    const partnerId = link.issueIdA === issueId ? link.issueIdB : link.issueIdA;
    const [partner] = await db.select({ issueNumber: oiIssues.issueNumber, title: oiIssues.title, status: oiIssues.status, category: oiIssues.category }).from(oiIssues).where(eq(oiIssues.id, partnerId));
    const linkedByName = await getUserDisplayName(link.linkedBy);
    return {
      id:                 link.id,
      partnerIssueId:     partnerId,
      partnerIssueNumber: partner?.issueNumber ?? null,
      partnerTitle:       partner?.title ?? null,
      partnerStatus:      partner?.status ?? null,
      partnerCategory:    partner?.category ?? null,
      linkType:           link.linkType,
      linkNote:           link.linkNote,
      linkedByName,
      linkedAt:           link.linkedAt,
    };
  }));

  return res.json(result);
});

// POST /api/oi/issues/:id/correlations
oiRcaRouter.post("/issues/:id/correlations", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const parsed = correlationLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  if (parsed.data.partnerIssueId === issueId) return res.status(422).json({ error: "self_link_not_allowed" });

  const [partner] = await db.select({ id: oiIssues.id }).from(oiIssues).where(eq(oiIssues.id, parsed.data.partnerIssueId));
  if (!partner) return res.status(422).json({ error: "partner_issue_not_found" });

  const a = Math.min(issueId, parsed.data.partnerIssueId);
  const b = Math.max(issueId, parsed.data.partnerIssueId);

  try {
    const [link] = await db.insert(oiRcaSimilarLinks).values({
      issueIdA: a, issueIdB: b, linkType: parsed.data.linkType, linkNote: parsed.data.linkNote ?? null, linkedBy: actor.id,
    }).returning();

    await writeAuditLog({ issueId, action: 'correlation_link_created', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `partnerIssueId=${parsed.data.partnerIssueId} type=${parsed.data.linkType}`, ipAddress: actor.ip });
    return res.status(201).json(link);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: "correlation_already_exists" });
    throw e;
  }
});

// DELETE /api/oi/issues/:id/correlations/:linkId
oiRcaRouter.delete("/issues/:id/correlations/:linkId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  const linkId  = parseInt(req.params.linkId);
  if (isNaN(issueId) || isNaN(linkId)) return res.status(400).json({ error: "invalid_id" });

  const [link] = await db.select().from(oiRcaSimilarLinks).where(and(
    eq(oiRcaSimilarLinks.id, linkId),
    or(eq(oiRcaSimilarLinks.issueIdA, issueId), eq(oiRcaSimilarLinks.issueIdB, issueId))
  ));
  if (!link) return res.status(404).json({ error: "not_found" });

  await db.delete(oiRcaSimilarLinks).where(eq(oiRcaSimilarLinks.id, linkId));
  await writeAuditLog({ issueId, action: 'correlation_link_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `linkId=${linkId}`, ipAddress: actor.ip });
  return res.status(204).end();
});

// ─── Dashboard Endpoints ──────────────────────────────────────────────────────

// GET /api/oi/dashboard/rca-completion
oiRcaRouter.get("/dashboard/rca-completion", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const periodDays = Math.min(365, Math.max(1, parseInt(req.query.periodDays as string) || 90));
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const rcaRequired = await db.select({ issueId: oiIssues.id }).from(oiIssues).where(and(eq(oiIssues.rcaRequired, true), sql`${oiIssues.createdAt} >= ${since}`));
  const reqIds = rcaRequired.map(r => r.issueId);
  const totalRcaRequired = reqIds.length;

  if (totalRcaRequired === 0) {
    return res.json({ totalRcaRequired: 0, rcaDraftCount: 0, rcaSubmittedCount: 0, rcaUnderReviewCount: 0, rcaApprovedCount: 0, rcaRejectedCount: 0, noRcaCount: 0, completionPct: 0, overdueCount: 0 });
  }

  const rcaRows = await db.select({ issueId: oiRcaRecords.issueId, status: oiRcaRecords.status }).from(oiRcaRecords).where(inArray(oiRcaRecords.issueId, reqIds));
  const rcaMap = new Map(rcaRows.map(r => [r.issueId, r.status]));

  let draft = 0, submitted = 0, underReview = 0, approved = 0, rejected = 0, noRca = 0;
  for (const id of reqIds) {
    const st = rcaMap.get(id);
    if (!st) noRca++;
    else if (st === 'draft') draft++;
    else if (st === 'submitted') submitted++;
    else if (st === 'under_review') underReview++;
    else if (st === 'approved') approved++;
    else if (st === 'rejected') rejected++;
  }

  const now = new Date();
  const overdueIssues = await db.select({ id: oiIssues.id }).from(oiIssues).where(and(
    eq(oiIssues.rcaRequired, true),
    sql`${oiIssues.rca_due_date} IS NOT NULL AND ${oiIssues.rca_due_date} < ${now}`,
    inArray(oiIssues.id, reqIds)
  ));
  // Filter out those with approved RCAs
  const approvedIds = new Set(rcaRows.filter(r => r.status === 'approved').map(r => r.issueId));
  const overdueCount = overdueIssues.filter(r => !approvedIds.has(r.id)).length;

  return res.json({
    totalRcaRequired, rcaDraftCount: draft, rcaSubmittedCount: submitted,
    rcaUnderReviewCount: underReview, rcaApprovedCount: approved, rcaRejectedCount: rejected,
    noRcaCount: noRca,
    completionPct: Math.round((approved / totalRcaRequired) * 100),
    overdueCount,
  });
});

// GET /api/oi/dashboard/rca-by-root-cause
oiRcaRouter.get("/dashboard/rca-by-root-cause", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const periodDays = Math.min(730, Math.max(1, parseInt(req.query.periodDays as string) || 180));
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      rootCauseCode: oiRcaRecords.rootCauseCode,
      issueId:       oiRcaRecords.issueId,
      issueStatus:   oiIssues.status,
      closedAt:      oiIssues.closedAt,
      createdAt:     oiIssues.createdAt,
    })
    .from(oiRcaRecords)
    .innerJoin(oiIssues, eq(oiIssues.id, oiRcaRecords.issueId))
    .where(and(eq(oiRcaRecords.status, 'approved'), sql`${oiIssues.createdAt} >= ${since}`));

  const OPEN_STATUSES = new Set(['captured','classified','investigating','verified','reopened']);
  const codeMap = new Map<string, { issueCount: number; openCount: number }>();
  for (const r of rows) {
    const entry = codeMap.get(r.rootCauseCode) ?? { issueCount: 0, openCount: 0 };
    entry.issueCount++;
    if (OPEN_STATUSES.has(r.issueStatus)) entry.openCount++;
    codeMap.set(r.rootCauseCode, entry);
  }

  const result = ROOT_CAUSE_CODES.map(code => ({
    rootCauseCode:  code,
    rootCauseLabel: ROOT_CAUSE_LABELS[code],
    issueCount:     codeMap.get(code)?.issueCount ?? 0,
    openCount:      codeMap.get(code)?.openCount ?? 0,
    avgMttrHours:   null as number | null,
  })).sort((a, b) => b.issueCount - a.issueCount);

  return res.json(result);
});

// GET /api/oi/dashboard/rca-time-to-complete
oiRcaRouter.get("/dashboard/rca-time-to-complete", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const periodDays = Math.min(365, Math.max(1, parseInt(req.query.periodDays as string) || 90));
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT
      EXTRACT(EPOCH FROM (approved_at - created_at)) / 86400 AS days_to_approval,
      revision_number,
      methodology
    FROM oi_rca_records
    WHERE status = 'approved' AND approved_at IS NOT NULL AND created_at >= ${since}
  `);

  const data = (rows.rows as any[]);
  const approvedInPeriod = data.length;
  if (approvedInPeriod === 0) {
    return res.json({ avgDaysToApproval: null, medianDaysToApproval: null, minDaysToApproval: null, maxDaysToApproval: null, approvedInPeriod: 0, avgRevisionCount: null, byMethodology: [] });
  }

  const days = data.map(r => Number(r.days_to_approval)).sort((a, b) => a - b);
  const avg  = days.reduce((s, v) => s + v, 0) / days.length;
  const med  = days.length % 2 === 0 ? (days[days.length / 2 - 1] + days[days.length / 2]) / 2 : days[Math.floor(days.length / 2)];
  const avgRev = data.reduce((s, r) => s + Number(r.revision_number), 0) / data.length;

  const byMeth: Record<string, number[]> = {};
  for (const r of data) {
    if (!byMeth[r.methodology]) byMeth[r.methodology] = [];
    byMeth[r.methodology].push(Number(r.days_to_approval));
  }
  const byMethodology = Object.entries(byMeth).map(([methodology, ds]) => ({
    methodology,
    avgDaysToApproval: ds.reduce((s, v) => s + v, 0) / ds.length,
    count: ds.length,
  }));

  return res.json({
    avgDaysToApproval:    Math.round(avg * 10) / 10,
    medianDaysToApproval: Math.round(med * 10) / 10,
    minDaysToApproval:    Math.round(days[0] * 10) / 10,
    maxDaysToApproval:    Math.round(days[days.length - 1] * 10) / 10,
    approvedInPeriod,
    avgRevisionCount:     Math.round(avgRev * 10) / 10,
    byMethodology,
  });
});

// GET /api/oi/dashboard/recurrence-rate
oiRcaRouter.get("/dashboard/recurrence-rate", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const minCount   = Math.max(2, parseInt(req.query.minCount as string) || 2);
  const periodDays = Math.min(365, Math.max(1, parseInt(req.query.periodDays as string) || 365));
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      rootCauseCode: oiRcaRecords.rootCauseCode,
      issueId:       oiRcaRecords.issueId,
      createdAt:     oiIssues.createdAt,
    })
    .from(oiRcaRecords)
    .innerJoin(oiIssues, eq(oiIssues.id, oiRcaRecords.issueId))
    .where(and(eq(oiRcaRecords.status, 'approved'), sql`${oiIssues.createdAt} >= ${since}`));

  const codeMap = new Map<string, Date[]>();
  for (const r of rows) {
    const arr = codeMap.get(r.rootCauseCode) ?? [];
    arr.push(new Date(r.createdAt));
    codeMap.set(r.rootCauseCode, arr);
  }

  const linkCounts = await db.select({
    issueIdA: oiRcaSimilarLinks.issueIdA,
    issueIdB: oiRcaSimilarLinks.issueIdB,
  }).from(oiRcaSimilarLinks);

  const result: any[] = [];
  for (const [code, dates] of codeMap) {
    if (dates.length < minCount) continue;
    dates.sort((a, b) => a.getTime() - b.getTime());
    const earliest = dates[0];
    const latest   = dates[dates.length - 1];
    const daysBetween = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24);
    const issueIds = rows.filter(r => r.rootCauseCode === code).map(r => r.issueId);
    const explicitLinkCount = linkCounts.filter(l => issueIds.includes(l.issueIdA) || issueIds.includes(l.issueIdB)).length;
    result.push({
      rootCauseCode:    code,
      rootCauseLabel:   ROOT_CAUSE_LABELS[code as typeof ROOT_CAUSE_CODES[number]] ?? code,
      issueCount:       dates.length,
      recurrenceCount:  dates.length - 1,
      earliestIssue:    earliest.toISOString(),
      latestIssue:      latest.toISOString(),
      daysBetweenFirst: Math.round(daysBetween),
      explicitLinkCount,
    });
  }

  result.sort((a, b) => b.issueCount - a.issueCount);
  return res.json(result);
});
