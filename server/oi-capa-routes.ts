import { Router } from "express";
import { db } from "./db";
import {
  oiCapaRecords, oiCapaActions, oiCapaEffectiveness, oiCapaEscalationLog,
  oiRcaRecords, oiIssues, users,
} from "@shared/schema";
import { eq, and, or, desc, asc, count, sql, inArray, lt, isNotNull, isNull, ne, ilike } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "./oi-audit-service";

export const oiCapaRouter = Router();

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
function hasRole(role: string, allowed: string[]): boolean { return allowed.includes(role); }

function computeIsOverdue(capa: { dueDate: Date | null; extendedDueDate: Date | null; status: string }): boolean {
  const effective = capa.extendedDueDate ?? capa.dueDate;
  if (!effective) return false;
  if (capa.status === 'closed' || capa.status === 'cancelled') return false;
  return effective < new Date();
}

async function fetchCapaWithCheck(capaId: number, actorRole: string) {
  const [capa] = await db.select().from(oiCapaRecords).where(eq(oiCapaRecords.id, capaId)).limit(1);
  return capa ?? null;
}

async function computeActionSummary(capaId: number) {
  const actions = await db.select({ status: oiCapaActions.status }).from(oiCapaActions).where(eq(oiCapaActions.capaId, capaId));
  return {
    total:     actions.length,
    open:      actions.filter(a => a.status === 'open').length,
    completed: actions.filter(a => a.status === 'completed').length,
    cancelled: actions.filter(a => a.status === 'cancelled').length,
  };
}

async function computeEffectivenessSummary(capaId: number) {
  const reviews = await db.select().from(oiCapaEffectiveness).where(eq(oiCapaEffectiveness.capaId, capaId)).orderBy(desc(oiCapaEffectiveness.reviewCycle));
  if (!reviews.length) return { totalReviews: 0, latestCycle: null, latestScore: null, latestIsEffective: null, latestRecurrenceObserved: null };
  const latest = reviews[0];
  return { totalReviews: reviews.length, latestCycle: latest.reviewCycle, latestScore: latest.effectivenessScore, latestIsEffective: latest.isEffective, latestRecurrenceObserved: latest.recurrenceObserved };
}

async function resolveUserName(userId: number | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
  return u ? (u.name || u.username || null) : null;
}

async function nextCapaNumber(): Promise<string> {
  const year = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getFullYear();
  const result = await db.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext('capa_number_seq'));
    SELECT COUNT(*)::int AS cnt FROM oi_capa_records
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = ${year}
  `);
  const cnt = Number((result as any).rows?.[(result as any).rows.length - 1]?.cnt ?? 0);
  return `CAPA-${year}-${String(cnt + 1).padStart(3, '0')}`;
}

// ─── Create CAPA ──────────────────────────────────────────────────────────────
// POST /api/oi/issues/:id/capa
const createCapaSchema = z.object({
  rcaId:         z.number().int().positive(),
  capaType:      z.enum(['corrective', 'preventive', 'combined']),
  title:         z.string().min(5).max(200),
  description:   z.string().min(10),
  rootCauseRef:  z.string().max(500).optional(),
  priority:      z.enum(['critical','high','medium','low']).optional().default('medium'),
  assignedTo:    z.number().int().positive().optional(),
  verifierId:    z.number().int().positive().optional(),
  approverId:    z.number().int().positive().optional(),
  dueDate:       z.string().datetime().optional(),
});

oiCapaRouter.post("/issues/:id/capa", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const parsed = createCapaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  const [issue] = await db.select({ id: oiIssues.id, status: oiIssues.status }).from(oiIssues).where(eq(oiIssues.id, issueId)).limit(1);
  if (!issue) return res.status(404).json({ error: "issue_not_found" });
  if (issue.status === 'withdrawn') return res.status(422).json({ error: "issue_withdrawn" });

  const [rca] = await db.select({ id: oiRcaRecords.id, issueId: oiRcaRecords.issueId, status: oiRcaRecords.status, rootCauseSummary: oiRcaRecords.rootCauseSummary })
    .from(oiRcaRecords).where(eq(oiRcaRecords.id, data.rcaId)).limit(1);
  if (!rca) return res.status(404).json({ error: "rca_not_found" });
  if (rca.issueId !== issueId) return res.status(422).json({ error: "rca_issue_mismatch", message: "RCA does not belong to this issue" });
  if (rca.status !== 'approved') return res.status(409).json({ error: "rca_not_approved", message: "CAPA requires an approved RCA" });

  if (data.approverId && data.assignedTo && data.approverId === data.assignedTo) {
    return res.status(422).json({ error: "approver_must_differ_from_assigned" });
  }

  const capaNumber = await nextCapaNumber();

  const dueDate = (data.dueDate && hasRole(actor.role, SM_ROLES)) ? new Date(data.dueDate) : null;

  const [capa] = await db.insert(oiCapaRecords).values({
    capaNumber,
    issueId,
    rcaId: data.rcaId,
    capaType: data.capaType,
    title: data.title,
    description: data.description,
    rootCauseRef: data.rootCauseRef ?? null,
    priority: data.priority,
    assignedTo: data.assignedTo ?? null,
    verifierId: data.verifierId ?? null,
    approverId: data.approverId ?? null,
    dueDate,
    createdBy: actor.id,
  }).returning();

  await writeAuditLog({
    issueId, action: 'capa_created', actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: JSON.stringify({ capaNumber, capaType: data.capaType, title: data.title, priority: data.priority, rcaId: data.rcaId }),
    ipAddress: actor.ip,
  });

  return res.status(201).json(capa);
});

// GET /api/oi/issues/:id/capa
oiCapaRouter.get("/issues/:id/capa", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const capas = await db.select().from(oiCapaRecords).where(eq(oiCapaRecords.issueId, issueId)).orderBy(desc(oiCapaRecords.createdAt));
  const now = new Date();
  return res.json(capas.map(c => ({
    ...c,
    isOverdue: computeIsOverdue(c),
  })));
});

// GET /api/oi/capa — Global register
oiCapaRouter.get("/capa", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const { status, priority, capaType, assignedTo, overdueOnly, issueId, rcaId, search } = req.query;
  const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

  const conditions: any[] = [];
  if (status)     conditions.push(eq(oiCapaRecords.status, status as string));
  if (priority)   conditions.push(eq(oiCapaRecords.priority, priority as string));
  if (capaType)   conditions.push(eq(oiCapaRecords.capaType, capaType as string));
  if (assignedTo) conditions.push(eq(oiCapaRecords.assignedTo, parseInt(assignedTo as string)));
  if (issueId)    conditions.push(eq(oiCapaRecords.issueId, parseInt(issueId as string)));
  if (rcaId)      conditions.push(eq(oiCapaRecords.rcaId, parseInt(rcaId as string)));
  if (search) {
    conditions.push(or(
      ilike(oiCapaRecords.capaNumber, `%${search}%`),
      ilike(oiCapaRecords.title, `%${search}%`),
    ));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(oiCapaRecords)
    .where(where)
    .orderBy(desc(oiCapaRecords.createdAt))
    .limit(limit).offset(offset);

  const now = new Date();
  const result = await Promise.all(rows.map(async c => {
    const isOverdue = computeIsOverdue(c);
    if (overdueOnly === 'true' && !isOverdue) return null;
    const [assignedToName, issueRow, actionSummary] = await Promise.all([
      resolveUserName(c.assignedTo),
      db.select({ issueCode: oiIssues.issueNumber }).from(oiIssues).where(eq(oiIssues.id, c.issueId)).limit(1),
      computeActionSummary(c.id),
    ]);
    return { ...c, isOverdue, assignedToName, issueCode: issueRow[0]?.issueCode ?? null, actionSummary };
  }));

  return res.json(result.filter(Boolean));
});

// GET /api/oi/capa/:capaId
oiCapaRouter.get("/capa/:capaId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });

  const [assignedToName, verifierName, approverName, createdByName, issueRow, rcaRow, actionSummary, effectivenessSummary] = await Promise.all([
    resolveUserName(capa.assignedTo),
    resolveUserName(capa.verifierId),
    resolveUserName(capa.approverId),
    resolveUserName(capa.createdBy),
    db.select({ issueCode: oiIssues.issueNumber, issueStatus: oiIssues.status, issueSeverity: oiIssues.severity }).from(oiIssues).where(eq(oiIssues.id, capa.issueId)).limit(1),
    db.select({ rootCauseCode: oiRcaRecords.rootCauseCode, rootCauseSummary: oiRcaRecords.rootCauseSummary }).from(oiRcaRecords).where(eq(oiRcaRecords.id, capa.rcaId)).limit(1),
    computeActionSummary(capaId),
    computeEffectivenessSummary(capaId),
  ]);

  return res.json({
    ...capa,
    isOverdue: computeIsOverdue(capa),
    assignedToName,
    verifierName,
    approverName,
    createdByName,
    issueCode:          issueRow[0]?.issueCode ?? null,
    issueStatus:        issueRow[0]?.issueStatus ?? null,
    issueSeverity:      issueRow[0]?.issueSeverity ?? null,
    rcaRootCauseCode:   rcaRow[0]?.rootCauseCode ?? null,
    rcaRootCauseLabel:  rcaRow[0]?.rootCauseSummary ?? null,
    actionSummary,
    effectivenessSummary,
  });
});

// PATCH /api/oi/capa/:capaId
const IMMUTABLE_POST_OPEN = new Set(['capaType','issueId','rcaId','capaNumber','createdBy']);
const ALLOWED_FIELDS = new Set(['title','description','rootCauseRef','priority','assignedTo','verifierId']);
const ALLOWED_SM_FIELDS = new Set(['approverId','dueDate','extendedDueDate']);

oiCapaRouter.patch("/capa/:capaId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (capa.status === 'closed' || capa.status === 'cancelled') return res.status(409).json({ error: "capa_is_final" });

  const isSm = hasRole(actor.role, SM_ROLES);
  const isPostPendingVerification = ['pending_verification','effectiveness_review','closed','cancelled'].includes(capa.status);
  const isPostOpen = ['open','in_progress','pending_verification','effectiveness_review','closed','cancelled'].includes(capa.status);

  const updates: Record<string, any> = {};
  const auditFields: Array<{ field: string; old: any; newVal: any }> = [];

  for (const [key, value] of Object.entries(req.body)) {
    if (IMMUTABLE_POST_OPEN.has(key) && isPostOpen) {
      return res.status(422).json({ error: "field_immutable_post_open", field: key });
    }
    if (ALLOWED_FIELDS.has(key)) {
      if (isPostPendingVerification && !['approverId','dueDate','extendedDueDate'].includes(key)) continue;
      if (key === 'priority' && !['draft','open'].includes(capa.status)) continue;
      const old = (capa as any)[key];
      if (old !== value) { updates[key] = value; auditFields.push({ field: key, old, newVal: value }); }
    } else if (ALLOWED_SM_FIELDS.has(key) && isSm) {
      if (key === 'approverId') {
        const newApprover = typeof value === 'number' ? value : null;
        const assignedTo = updates.assignedTo ?? capa.assignedTo;
        if (newApprover && assignedTo && newApprover === assignedTo) {
          return res.status(422).json({ error: "approver_must_differ_from_assigned" });
        }
      }
      const old = (capa as any)[key];
      if (old !== value) { updates[key] = value === null ? null : (key.endsWith('Date') ? new Date(value as string) : value); auditFields.push({ field: key, old, newVal: value }); }
    }
  }

  if (!Object.keys(updates).length) return res.json(capa);

  updates.updatedAt = new Date();
  const [updated] = await db.update(oiCapaRecords).set(updates).where(eq(oiCapaRecords.id, capaId)).returning();

  for (const f of auditFields) {
    await writeAuditLog({ issueId: capa.issueId, action: 'field_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: f.field, oldValue: String(f.old ?? ''), newValue: String(f.newVal ?? ''), context: `CAPA ${capa.capaNumber}`, ipAddress: actor.ip });
  }
  return res.json(updated);
});

// POST /api/oi/capa/:capaId/transition
const transitionSchema = z.object({
  action:             z.enum(['open','start','submit','verify','close','cancel','reopen']),
  cancellationReason: z.string().optional(),
});

oiCapaRouter.post("/capa/:capaId/transition", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const { action, cancellationReason } = parsed.data;

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });

  type Transition = { from: string; to: string; roles: string[] };
  const TRANSITIONS: Record<string, Transition> = {
    open:   { from: 'draft',                 to: 'open',                 roles: MANAGER_ROLES },
    start:  { from: 'open',                  to: 'in_progress',          roles: [...MANAGER_ROLES] },
    submit: { from: 'in_progress',           to: 'pending_verification', roles: [...MANAGER_ROLES] },
    verify: { from: 'pending_verification',  to: 'effectiveness_review', roles: MANAGER_ROLES },
    close:  { from: 'effectiveness_review',  to: 'closed',               roles: SM_ROLES },
    cancel: { from: '',                      to: 'cancelled',            roles: SM_ROLES },
    reopen: { from: 'effectiveness_review',  to: 'in_progress',          roles: SM_ROLES },
  };

  const tDef = TRANSITIONS[action];

  if (action === 'cancel') {
    if (capa.status === 'closed') return res.status(409).json({ error: "already_closed" });
    if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (!cancellationReason || cancellationReason.trim().length < 10) {
      return res.status(422).json({ error: "cancellation_reason_required" });
    }
  } else {
    if (capa.status !== tDef.from) return res.status(409).json({ error: "transition_not_permitted", currentStatus: capa.status });
    if (!hasRole(actor.role, tDef.roles)) {
      // Special case: 'start' and 'submit' can also be done by assigned_to
      if ((action === 'start' || action === 'submit') && actor.id === capa.assignedTo) {
        // allowed
      } else {
        return res.status(403).json({ error: "forbidden" });
      }
    }
  }

  const now = new Date();
  const updates: Record<string, any> = { status: tDef?.to ?? 'cancelled', updatedAt: now };
  let auditAction: any = 'status_changed';

  if (action === 'open')   { updates.openedAt = now; }
  if (action === 'start')  { updates.inProgressAt = now; }
  if (action === 'submit') {
    const openActions = await db.select({ id: oiCapaActions.id }).from(oiCapaActions)
      .where(and(eq(oiCapaActions.capaId, capaId), eq(oiCapaActions.status, 'open'))).limit(1);
    if (openActions.length) return res.status(409).json({ error: "open_action_items_exist", message: "All action items must be completed or cancelled before submitting" });
    updates.pendingVerificationAt = now;
  }
  if (action === 'verify') { updates.effectivenessReviewAt = now; }
  if (action === 'close') {
    const reviews = await db.select().from(oiCapaEffectiveness).where(eq(oiCapaEffectiveness.capaId, capaId)).orderBy(desc(oiCapaEffectiveness.reviewCycle)).limit(1);
    if (!reviews.length) return res.status(409).json({ error: "no_effectiveness_review", message: "An effectiveness review must be recorded before closing" });
    const latest = reviews[0];
    if (!latest.isEffective) return res.status(409).json({ error: "not_effective", message: "Most recent effectiveness review is not effective" });
    if (latest.recurrenceObserved) return res.status(409).json({ error: "recurrence_observed", message: "Recurrence observed. CAPA must be reopened before closure." });
    updates.closedAt = now;
  }
  if (action === 'cancel') {
    updates.status = 'cancelled';
    updates.cancelledAt = now;
    updates.cancellationReason = cancellationReason!.trim();
    auditAction = 'capa_cancelled';
  }
  if (action === 'reopen') {
    const reviews = await db.select().from(oiCapaEffectiveness).where(eq(oiCapaEffectiveness.capaId, capaId)).orderBy(desc(oiCapaEffectiveness.reviewCycle)).limit(1);
    if (!reviews.length) return res.status(409).json({ error: "no_effectiveness_review" });
    const latest = reviews[0];
    if (latest.isEffective && !latest.recurrenceObserved) return res.status(409).json({ error: "reopen_not_permitted", message: "Cannot reopen: most recent review is effective with no recurrence" });
    updates.reOpenCount = capa.reOpenCount + 1;
    updates.inProgressAt = now;
    updates.status = 'in_progress';
  }

  const [updated] = await db.update(oiCapaRecords).set(updates).where(eq(oiCapaRecords.id, capaId)).returning();

  await writeAuditLog({ issueId: capa.issueId, action: auditAction, actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: 'capa_status', oldValue: capa.status, newValue: updates.status, context: `CAPA ${capa.capaNumber}`, ipAddress: actor.ip });
  if (action === 'reopen') {
    await writeAuditLog({ issueId: capa.issueId, action: 'capa_reopened', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `CAPA ${capa.capaNumber} re_open_count=${updates.reOpenCount}`, ipAddress: actor.ip });
  }

  return res.json(updated);
});

// DELETE /api/oi/capa/:capaId
oiCapaRouter.delete("/capa/:capaId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (capa.status !== 'draft') return res.status(409).json({ error: "only_draft_deletable" });

  await db.delete(oiCapaRecords).where(eq(oiCapaRecords.id, capaId));
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_deleted', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `CAPA ${capa.capaNumber}`, ipAddress: actor.ip });
  return res.json({ deleted: true, capaNumber: capa.capaNumber });
});

// ─── Action Items ─────────────────────────────────────────────────────────────
const actionCreateSchema = z.object({
  description: z.string().min(5).max(500),
  assignedTo:  z.number().int().positive().optional(),
  dueDate:     z.string().datetime().optional(),
});

oiCapaRouter.post("/capa/:capaId/actions", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (!['draft','open','in_progress'].includes(capa.status)) return res.status(409).json({ error: "not_editable", currentStatus: capa.status });

  const parsed = actionCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [maxRow] = await db.select({ maxNo: sql<number>`COALESCE(MAX(action_no), 0)` }).from(oiCapaActions).where(eq(oiCapaActions.capaId, capaId));
  const total = Number(maxRow?.maxNo ?? 0);
  if (total >= 20) return res.status(422).json({ error: "max_actions_exceeded" });

  const [action] = await db.insert(oiCapaActions).values({
    capaId,
    actionNo:    total + 1,
    description: parsed.data.description,
    assignedTo:  parsed.data.assignedTo ?? null,
    dueDate:     parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    createdBy:   actor.id,
  }).returning();

  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_added', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: action.actionNo, description: parsed.data.description }), ipAddress: actor.ip });
  return res.status(201).json(action);
});

oiCapaRouter.get("/capa/:capaId/actions", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });
  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  const actions = await db.select().from(oiCapaActions).where(eq(oiCapaActions.capaId, capaId)).orderBy(asc(oiCapaActions.actionNo));
  return res.json(actions);
});

oiCapaRouter.patch("/capa/:capaId/actions/:actionId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId   = parseInt(req.params.capaId);
  const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (!['draft','open','in_progress'].includes(capa.status)) return res.status(409).json({ error: "not_editable" });

  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });

  const updates: Record<string, any> = { updatedAt: new Date() };
  const auditParts: string[] = [];
  if (req.body.description && typeof req.body.description === 'string') { updates.description = req.body.description; auditParts.push(`description`); }
  if (req.body.assignedTo !== undefined) { updates.assignedTo = req.body.assignedTo || null; auditParts.push('assignedTo'); }
  if (req.body.dueDate !== undefined) { updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null; auditParts.push('dueDate'); }

  const [updated] = await db.update(oiCapaActions).set(updates).where(eq(oiCapaActions.id, actionId)).returning();
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_updated', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: act.actionNo, fields: auditParts }), ipAddress: actor.ip });
  return res.json(updated);
});

oiCapaRouter.post("/capa/:capaId/actions/:actionId/complete", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES) && actor.id === undefined) return res.status(403).json({ error: "forbidden" });
  const capaId   = parseInt(req.params.capaId);
  const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (!['in_progress','pending_verification'].includes(capa.status)) return res.status(409).json({ error: "not_permitted", currentStatus: capa.status });

  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });
  if (act.status !== 'open') return res.status(409).json({ error: "action_not_open" });

  const isAssignee = actor.id === act.assignedTo;
  if (!isAssignee && !hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const completionNote = typeof req.body.completionNote === 'string' ? req.body.completionNote.slice(0, 1000) : null;
  const [updated] = await db.update(oiCapaActions).set({ status: 'completed', completedAt: new Date(), completedBy: actor.id, completionNote, updatedAt: new Date() }).where(eq(oiCapaActions.id, actionId)).returning();
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_completed', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: act.actionNo }), ipAddress: actor.ip });
  return res.json(updated);
});

oiCapaRouter.post("/capa/:capaId/actions/:actionId/verify", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId); const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });
  if (act.status !== 'completed') return res.status(409).json({ error: "action_not_completed" });
  if (!['pending_verification','effectiveness_review'].includes(capa.status)) return res.status(409).json({ error: "capa_not_verifiable" });

  const [updated] = await db.update(oiCapaActions).set({ verificationStatus: 'verified', verifiedAt: new Date(), verifiedBy: actor.id, verificationNote: null, updatedAt: new Date() }).where(eq(oiCapaActions.id, actionId)).returning();
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_verified', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: act.actionNo }), ipAddress: actor.ip });
  return res.json(updated);
});

oiCapaRouter.post("/capa/:capaId/actions/:actionId/reject-verification", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId); const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });
  if (act.status !== 'completed') return res.status(409).json({ error: "action_not_completed" });

  const note = typeof req.body.verificationNote === 'string' ? req.body.verificationNote.trim() : '';
  if (note.length < 10) return res.status(422).json({ error: "verification_note_required" });

  const [updated] = await db.update(oiCapaActions).set({ verificationStatus: 'rejected', verifiedAt: new Date(), verifiedBy: actor.id, verificationNote: note, updatedAt: new Date() }).where(eq(oiCapaActions.id, actionId)).returning();
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_verification_rejected', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: act.actionNo, verificationNote: note }), ipAddress: actor.ip });
  return res.json(updated);
});

oiCapaRouter.post("/capa/:capaId/actions/:actionId/cancel", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId); const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (!['draft','open','in_progress'].includes(capa.status)) return res.status(409).json({ error: "not_cancellable" });
  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });
  if (act.status !== 'open') return res.status(409).json({ error: "action_not_open" });

  const [updated] = await db.update(oiCapaActions).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(oiCapaActions.id, actionId)).returning();
  await writeAuditLog({ issueId: capa.issueId, action: 'capa_action_cancelled', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, actionNo: act.actionNo }), ipAddress: actor.ip });
  return res.json(updated);
});

oiCapaRouter.delete("/capa/:capaId/actions/:actionId", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId); const actionId = parseInt(req.params.actionId);
  if (isNaN(capaId) || isNaN(actionId)) return res.status(400).json({ error: "invalid_id" });
  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (!['draft','open'].includes(capa.status)) return res.status(409).json({ error: "not_deletable" });
  const [act] = await db.select().from(oiCapaActions).where(and(eq(oiCapaActions.id, actionId), eq(oiCapaActions.capaId, capaId))).limit(1);
  if (!act) return res.status(404).json({ error: "action_not_found" });
  if (act.status !== 'open') return res.status(409).json({ error: "action_not_open" });
  await db.delete(oiCapaActions).where(eq(oiCapaActions.id, actionId));
  return res.json({ deleted: true });
});

// ─── Effectiveness Reviews ────────────────────────────────────────────────────
const effectivenessSchema = z.object({
  effectivenessScore: z.number().int().min(1).max(5),
  isEffective:        z.boolean(),
  recurrenceObserved: z.boolean(),
  evidenceNotes:      z.string().max(2000).optional(),
  recommendation:     z.string().max(1000).optional(),
});

oiCapaRouter.post("/capa/:capaId/effectiveness", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  if (capa.status !== 'effectiveness_review') return res.status(409).json({ error: "not_in_effectiveness_review", currentStatus: capa.status });

  const parsed = effectivenessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  if (data.isEffective && data.recurrenceObserved) return res.status(422).json({ error: "contradiction_effective_and_recurrence" });
  if (!data.isEffective && (!data.recommendation || data.recommendation.trim().length < 10)) {
    return res.status(422).json({ error: "recommendation_required_when_ineffective" });
  }

  const reviewCycle = capa.reOpenCount + 1;
  const existing = await db.select({ id: oiCapaEffectiveness.id }).from(oiCapaEffectiveness)
    .where(and(eq(oiCapaEffectiveness.capaId, capaId), eq(oiCapaEffectiveness.reviewCycle, reviewCycle))).limit(1);
  if (existing.length) return res.status(409).json({ error: "already_reviewed_this_cycle" });

  const [review] = await db.insert(oiCapaEffectiveness).values({
    capaId,
    reviewCycle,
    reviewerId: actor.id,
    effectivenessScore: data.effectivenessScore,
    isEffective: data.isEffective,
    recurrenceObserved: data.recurrenceObserved,
    evidenceNotes: data.evidenceNotes ?? null,
    recommendation: data.recommendation ?? null,
  }).returning();

  await writeAuditLog({ issueId: capa.issueId, action: 'capa_effectiveness_recorded', actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: JSON.stringify({ capaNumber: capa.capaNumber, reviewCycle, effectivenessScore: data.effectivenessScore, isEffective: data.isEffective, recurrenceObserved: data.recurrenceObserved }), ipAddress: actor.ip });
  return res.status(201).json(review);
});

oiCapaRouter.get("/capa/:capaId/effectiveness", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });
  const capa = await fetchCapaWithCheck(capaId, actor.role);
  if (!capa) return res.status(404).json({ error: "not_found" });
  const reviews = await db.select().from(oiCapaEffectiveness).where(eq(oiCapaEffectiveness.capaId, capaId)).orderBy(asc(oiCapaEffectiveness.reviewCycle));
  return res.json(reviews);
});

// ─── Dashboards ───────────────────────────────────────────────────────────────
oiCapaRouter.get("/dashboard/capa-summary", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const periodDays = Math.min(365, Math.max(1, parseInt(req.query.periodDays as string) || 90));
  const since = new Date(Date.now() - periodDays * 86400000);
  const now = new Date();

  const rows = await db.select().from(oiCapaRecords).where(sql`${oiCapaRecords.createdAt} >= ${since}`);
  const closedRows = await db.select({ closedAt: oiCapaRecords.closedAt }).from(oiCapaRecords)
    .where(and(eq(oiCapaRecords.status, 'closed'), sql`${oiCapaRecords.closedAt} >= ${since}`));

  return res.json({
    totalCapa:                    rows.length,
    draftCount:                   rows.filter(r => r.status === 'draft').length,
    openCount:                    rows.filter(r => r.status === 'open').length,
    inProgressCount:              rows.filter(r => r.status === 'in_progress').length,
    pendingVerificationCount:     rows.filter(r => r.status === 'pending_verification').length,
    effectivenessReviewCount:     rows.filter(r => r.status === 'effectiveness_review').length,
    closedCount:                  rows.filter(r => r.status === 'closed').length,
    cancelledCount:               rows.filter(r => r.status === 'cancelled').length,
    overdueCount:                 rows.filter(r => computeIsOverdue(r)).length,
    closedInPeriod:               closedRows.length,
    periodDays,
  });
});

oiCapaRouter.get("/dashboard/capa-by-type", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const periodDays = Math.min(730, Math.max(1, parseInt(req.query.periodDays as string) || 180));
  const since = new Date(Date.now() - periodDays * 86400000);

  const rows = await db.select().from(oiCapaRecords).where(sql`${oiCapaRecords.createdAt} >= ${since}`);
  const typeLabels: Record<string, string> = { corrective: 'Corrective', preventive: 'Preventive', combined: 'Combined' };

  const result = ['corrective','preventive','combined'].map(ct => {
    const sub = rows.filter(r => r.capaType === ct);
    return {
      capaType:      ct,
      capaTypeLabel: typeLabels[ct],
      total:         sub.length,
      criticalCount: sub.filter(r => r.priority === 'critical').length,
      highCount:     sub.filter(r => r.priority === 'high').length,
      mediumCount:   sub.filter(r => r.priority === 'medium').length,
      lowCount:      sub.filter(r => r.priority === 'low').length,
      closedCount:   sub.filter(r => r.status === 'closed').length,
      openCount:     sub.filter(r => r.status !== 'closed' && r.status !== 'cancelled').length,
      overdueCount:  sub.filter(r => computeIsOverdue(r)).length,
    };
  });
  return res.json(result);
});

oiCapaRouter.get("/dashboard/capa-sla", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const periodDays = Math.min(730, Math.max(1, parseInt(req.query.periodDays as string) || 180));
  const since = new Date(Date.now() - periodDays * 86400000);
  const now = new Date();

  const rows = await db.select().from(oiCapaRecords).where(sql`${oiCapaRecords.createdAt} >= ${since}`);
  const effectiveDue = (r: any) => r.extendedDueDate ?? r.dueDate;

  const closedWithDue = rows.filter(r => r.status === 'closed' && r.closedAt && effectiveDue(r));
  const closedOnTime  = closedWithDue.filter(r => r.closedAt! <= effectiveDue(r)!).length;
  const closedOverdue = closedWithDue.filter(r => r.closedAt! > effectiveDue(r)!).length;
  const currentlyOverdue = rows.filter(r => computeIsOverdue(r)).length;
  const slaAdherencePct  = (closedOnTime + closedOverdue) > 0 ? Math.round((closedOnTime / (closedOnTime + closedOverdue)) * 100) : null;

  const closedAll = rows.filter(r => r.status === 'closed' && r.closedAt);
  const daysList  = closedAll.map(r => (r.closedAt!.getTime() - r.createdAt.getTime()) / 86400000).sort((a,b)=>a-b);
  const avgDaysToClose    = daysList.length ? Math.round((daysList.reduce((s,v)=>s+v,0)/daysList.length)*10)/10 : null;
  const medianDaysToClose = daysList.length ? Math.round((daysList.length % 2 === 0 ? (daysList[daysList.length/2-1]+daysList[daysList.length/2])/2 : daysList[Math.floor(daysList.length/2)])*10)/10 : null;

  const overdueOpen = rows.filter(r => computeIsOverdue(r));
  const overdueOpenDays = overdueOpen.map(r => (now.getTime() - (effectiveDue(r) as Date).getTime()) / 86400000);
  const avgDaysOverdueOpen = overdueOpenDays.length ? Math.round((overdueOpenDays.reduce((s,v)=>s+v,0)/overdueOpenDays.length)*10)/10 : null;

  const capaIds = rows.map(r => r.id);
  const [l1Count, l2Count, l3Count] = capaIds.length ? await Promise.all([
    db.select({ c: count() }).from(oiCapaEscalationLog).where(and(inArray(oiCapaEscalationLog.capaId, capaIds), eq(oiCapaEscalationLog.level, 1))),
    db.select({ c: count() }).from(oiCapaEscalationLog).where(and(inArray(oiCapaEscalationLog.capaId, capaIds), eq(oiCapaEscalationLog.level, 2))),
    db.select({ c: count() }).from(oiCapaEscalationLog).where(and(inArray(oiCapaEscalationLog.capaId, capaIds), eq(oiCapaEscalationLog.level, 3))),
  ]) : [[], [], []];

  return res.json({
    closedOnTime,
    closedOverdue,
    currentlyOverdue,
    slaAdherencePct,
    avgDaysToClose,
    medianDaysToClose,
    avgDaysOverdueOpen,
    l1EscalationsFired: Number((l1Count as any)[0]?.c ?? 0),
    l2EscalationsFired: Number((l2Count as any)[0]?.c ?? 0),
    l3EscalationsFired: Number((l3Count as any)[0]?.c ?? 0),
    periodDays,
  });
});

oiCapaRouter.get("/dashboard/capa-effectiveness", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const periodDays = Math.min(730, Math.max(1, parseInt(req.query.periodDays as string) || 365));
  const since = new Date(Date.now() - periodDays * 86400000);

  const reviews = await db.select().from(oiCapaEffectiveness).where(sql`${oiCapaEffectiveness.reviewedAt} >= ${since}`);
  const totalReviewed      = reviews.length;
  const effectiveCount     = reviews.filter(r => r.isEffective).length;
  const ineffectiveCount   = reviews.filter(r => !r.isEffective).length;
  const recurrenceObservedCount = reviews.filter(r => r.recurrenceObserved).length;
  const effectivenessRatePct = totalReviewed > 0 ? Math.round((effectiveCount / totalReviewed) * 100) : null;
  const avgScore = totalReviewed > 0 ? Math.round((reviews.reduce((s,r)=>s+r.effectivenessScore,0)/totalReviewed)*10)/10 : null;

  const closedCapas = await db.select({ reOpenCount: oiCapaRecords.reOpenCount })
    .from(oiCapaRecords).where(and(eq(oiCapaRecords.status, 'closed'), sql`${oiCapaRecords.closedAt} >= ${since}`));
  const avgCyclesToClose = closedCapas.length ? Math.round((closedCapas.reduce((s,r)=>s+(r.reOpenCount+1),0)/closedCapas.length)*10)/10 : null;

  const SCORE_LABELS: Record<number,string> = {1:'Completely Ineffective',2:'Marginally Effective',3:'Partially Effective',4:'Mostly Effective',5:'Fully Effective'};
  const scoreDistribution = [1,2,3,4,5].map(score => ({
    score,
    label: SCORE_LABELS[score],
    count: reviews.filter(r=>r.effectivenessScore===score).length,
  }));

  return res.json({ totalReviewed, effectiveCount, ineffectiveCount, recurrenceObservedCount, effectivenessRatePct, avgScore, avgCyclesToClose, scoreDistribution, periodDays });
});
