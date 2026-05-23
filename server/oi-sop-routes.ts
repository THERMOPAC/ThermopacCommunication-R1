import { Router } from "express";
import { db } from "./db";
import {
  oiSopRecords, oiSopRevisions, oiSopLinkages, oiSopAcknowledgments,
  oiSopEffectiveness, oiSopAuditLog,
  oiIssues, oiRcaRecords, oiCapaRecords, users,
  departmentMaster,
} from "@shared/schema";
import { eq, and, or, desc, asc, count, sql, inArray, lt, isNull, isNotNull, ne, ilike } from "drizzle-orm";
import { z } from "zod";
import { writeSopAuditLog } from "./oi-sop-audit-service";

export const oiSopRouter = Router();

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];

// Amendment B: hardcoded fallback — used only if DB query fails or returns 0 rows.
// _validDepts is NEVER left empty. Three-layer guard below.
const DEPT_HARDCODED_FALLBACK = new Set([
  "Accounts","Administration","After Sales","Design","Marketing",
  "Production","Projects","Purchase","Quality Control","Stores",
]);
let _validDepts: Set<string> = new Set(DEPT_HARDCODED_FALLBACK); // safe default at module load

export async function loadValidDepartmentsSop(): Promise<void> {
  try {
    const rows = await db
      .select({ name: departmentMaster.name })
      .from(departmentMaster)
      .where(eq(departmentMaster.isActive, true));
    if (rows.length > 0) {
      // Guard 1 (normal path): DB returned rows — use them.
      _validDepts = new Set(rows.map(r => r.name));
      console.log(`[DeptSeed] SOP _validDepts loaded from DB — ${_validDepts.size} active departments.`);
    } else {
      // Guard 2 (empty table): fall back to hardcoded list.
      _validDepts = new Set(DEPT_HARDCODED_FALLBACK);
      console.warn("[DeptSeed] WARNING: department_master has 0 active rows (SOP) — using hardcoded fallback. Run seed.");
    }
  } catch (err) {
    // Guard 3 (DB failure): do NOT reassign — module-init hardcoded value remains active.
    console.error("[DeptSeed] ERROR: Failed to load valid departments (SOP) — retaining fallback:", err);
  }
}
const VALID_SOP_TYPES = ["procedure","work_instruction","policy","guideline","checklist"];
const VALID_LINKED_TYPES = ["issue","rca","capa"];

function actorFromReq(req: any) {
  return {
    id:   req.user.id as number,
    name: (req.user.name || req.user.username || "Unknown") as string,
    role: (req.user.role || "Employee") as string,
    ip:   (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "") as string,
  };
}
function hasRole(role: string, allowed: string[]): boolean { return allowed.includes(role); }

// Async error wrapper — catches thrown errors in async route handlers and
// returns 500 instead of leaving an unhandled promise rejection.
const wrap = (fn: (req: any, res: any) => Promise<any>) =>
  async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (err) {
      console.error("[OI-SOP] Unhandled route error:", err);
      if (!res.headersSent) res.status(500).json({ error: "internal_error" });
    }
  };

async function resolveUserName(userId: number | null): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ username: users.username })
    .from(users).where(eq(users.id, userId)).limit(1);
  return u ? (u.username || null) : null;
}

async function nextSopNumber(): Promise<string> {
  const year = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getFullYear();
  const result = await db.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext('sop_number_seq'));
    SELECT COUNT(*)::int AS cnt FROM oi_sop_records
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = ${year}
  `);
  const cnt = Number((result as any).rows?.[(result as any).rows.length - 1]?.cnt ?? 0);
  return `SOP-${year}-${String(cnt + 1).padStart(3, "0")}`;
}

async function fetchSop(sopId: number) {
  const [sop] = await db.select().from(oiSopRecords).where(eq(oiSopRecords.id, sopId)).limit(1);
  return sop ?? null;
}

async function hasPendingRevision(sopId: number): Promise<boolean> {
  const rows = await db.select({ id: oiSopRevisions.id })
    .from(oiSopRevisions)
    .where(and(
      eq(oiSopRevisions.sopId, sopId),
      or(eq(oiSopRevisions.status, "draft"), eq(oiSopRevisions.status, "under_review")),
    )).limit(1);
  return rows.length > 0;
}

async function computeAckSummary(sopId: number, revisionNumber: number) {
  const acks = await db.select({
    acknowledgedAt: oiSopAcknowledgments.acknowledgedAt,
    dueDate: oiSopAcknowledgments.dueDate,
  }).from(oiSopAcknowledgments).where(
    and(eq(oiSopAcknowledgments.sopId, sopId), eq(oiSopAcknowledgments.revisionNumber, revisionNumber)),
  );
  const now = new Date();
  return {
    total:       acks.length,
    acknowledged: acks.filter(a => !!a.acknowledgedAt).length,
    pending:      acks.filter(a => !a.acknowledgedAt).length,
    overdue:      acks.filter(a => !a.acknowledgedAt && a.dueDate && a.dueDate < now).length,
  };
}

async function computeEffectivenessSummary(sopId: number) {
  const reviews = await db.select().from(oiSopEffectiveness)
    .where(eq(oiSopEffectiveness.sopId, sopId))
    .orderBy(desc(oiSopEffectiveness.reviewCycle));
  if (!reviews.length) return { totalReviews: 0, latestCycle: null, latestScore: null, latestIsEffective: null };
  const latest = reviews[0];
  return {
    totalReviews: reviews.length,
    latestCycle: latest.reviewCycle,
    latestScore: latest.effectivenessScore,
    latestIsEffective: latest.isEffective,
  };
}

// ─── 1. POST /sop — Create SOP ────────────────────────────────────────────────
const createSopSchema = z.object({
  title:             z.string().min(5).max(300),
  description:       z.string().min(10),
  sopType:           z.enum(["procedure","work_instruction","policy","guideline","checklist"]),
  department:        z.enum(["Accounts","Administration","After Sales","Design","Marketing","Production","Projects","Purchase","Quality Control","Stores"]),
  processArea:       z.string().min(2).max(200),
  documentReference: z.string().max(200).optional(),
  ownerId:           z.number().int().positive().optional(),
  approverId:        z.number().int().positive().optional(),
  effectiveDate:     z.string().datetime().optional(),
  reviewDueDate:     z.string().datetime().optional(),
  nextReviewDate:    z.string().datetime().optional(),
});

oiSopRouter.post("/sop", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const parsed = createSopSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  const ownerId    = data.ownerId ?? actor.id;
  const approverId = data.approverId ?? null;

  if (approverId && approverId === ownerId) {
    return res.status(422).json({ error: "approver_must_differ_from_owner" });
  }

  const sopNumber = await nextSopNumber();

  const [sop] = await db.insert(oiSopRecords).values({
    sopNumber,
    title:             data.title,
    description:       data.description,
    sopType:           data.sopType,
    department:        data.department,
    processArea:       data.processArea,
    documentReference: data.documentReference ?? null,
    ownerId,
    approverId,
    effectiveDate:  data.effectiveDate  ? new Date(data.effectiveDate)  : null,
    reviewDueDate:  data.reviewDueDate  ? new Date(data.reviewDueDate)  : null,
    nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : null,
    createdBy: actor.id,
  }).returning();

  await writeSopAuditLog({
    sopId: sop.id, action: "sop_created",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sopNumber} created`, ipAddress: actor.ip,
  });

  return res.status(201).json(sop);
}));

// ─── 2. GET /sop — List SOP Register ─────────────────────────────────────────
oiSopRouter.get("/sop", wrap(async (req: any, res: any) => {
  const { status, department, sopType, ownerId, overdueReviewOnly, search, limit = "100", offset = "0" } = req.query;

  const conditions: any[] = [];
  if (status)     conditions.push(eq(oiSopRecords.status, status));
  if (department) conditions.push(eq(oiSopRecords.department, department));
  if (sopType)    conditions.push(eq(oiSopRecords.sopType, sopType));
  if (ownerId)    conditions.push(eq(oiSopRecords.ownerId, parseInt(ownerId)));
  if (search)     conditions.push(or(ilike(oiSopRecords.title, `%${search}%`), ilike(oiSopRecords.sopNumber, `%${search}%`)));

  const rows = await db
    .select({
      id:                oiSopRecords.id,
      sopNumber:         oiSopRecords.sopNumber,
      title:             oiSopRecords.title,
      description:       oiSopRecords.description,
      sopType:           oiSopRecords.sopType,
      department:        oiSopRecords.department,
      processArea:       oiSopRecords.processArea,
      documentReference: oiSopRecords.documentReference,
      status:            oiSopRecords.status,
      ownerId:           oiSopRecords.ownerId,
      approverId:        oiSopRecords.approverId,
      revisionNumber:    oiSopRecords.revisionNumber,
      effectiveDate:     oiSopRecords.effectiveDate,
      reviewDueDate:     oiSopRecords.reviewDueDate,
      nextReviewDate:    oiSopRecords.nextReviewDate,
      activatedAt:       oiSopRecords.activatedAt,
      retiredAt:         oiSopRecords.retiredAt,
      createdBy:         oiSopRecords.createdBy,
      createdAt:         oiSopRecords.createdAt,
      updatedAt:         oiSopRecords.updatedAt,
      ownerName:         users.username,
    })
    .from(oiSopRecords)
    .leftJoin(users, eq(users.id, oiSopRecords.ownerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(oiSopRecords.createdAt))
    .limit(parseInt(limit as string))
    .offset(parseInt(offset as string));

  const now = new Date();
  const result = await Promise.all(rows.map(async (r) => {
    const isReviewOverdue = r.status === "active" && r.reviewDueDate != null && r.reviewDueDate < now;
    if (overdueReviewOnly === "true" && !isReviewOverdue) return null;
    const ackSummary = await computeAckSummary(r.id, r.revisionNumber);
    const linkCount = await db.select({ cnt: count() }).from(oiSopLinkages).where(eq(oiSopLinkages.sopId, r.id));
    return {
      ...r,
      isReviewOverdue,
      ackSummary,
      linkageCount: Number(linkCount[0]?.cnt ?? 0),
    };
  }));

  return res.json(result.filter(Boolean));
}));

// ─── 3. GET /sop/:sopId — SOP Detail ─────────────────────────────────────────
oiSopRouter.get("/sop/:sopId", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const [ownerName, approverName] = await Promise.all([
    resolveUserName(sop.ownerId),
    resolveUserName(sop.approverId),
  ]);

  const pendingRevision = await hasPendingRevision(sopId);
  const ackSummary      = await computeAckSummary(sopId, sop.revisionNumber);
  const effectSummary   = await computeEffectivenessSummary(sopId);
  const now = new Date();
  const isReviewOverdue = sop.status === "active" && sop.reviewDueDate != null && sop.reviewDueDate < now;

  return res.json({ ...sop, ownerName, approverName, pendingRevision, ackSummary, effectSummary, isReviewOverdue });
}));

// ─── 4. PATCH /sop/:sopId — Update SOP Fields ────────────────────────────────
const updateSopSchema = z.object({
  title:             z.string().min(5).max(300).optional(),
  description:       z.string().min(10).optional(),
  sopType:           z.enum(["procedure","work_instruction","policy","guideline","checklist"]).optional(),
  department:        z.enum(["Accounts","Administration","After Sales","Design","Marketing","Production","Projects","Purchase","Quality Control","Stores"]).optional(),
  processArea:       z.string().min(2).max(200).optional(),
  documentReference: z.string().max(200).nullable().optional(),
  ownerId:           z.number().int().positive().nullable().optional(),
  approverId:        z.number().int().positive().nullable().optional(),
  effectiveDate:     z.string().datetime().nullable().optional(),
  reviewDueDate:     z.string().datetime().nullable().optional(),
  nextReviewDate:    z.string().datetime().nullable().optional(),
});

oiSopRouter.patch("/sop/:sopId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });
  if (sop.status === "retired") return res.status(422).json({ error: "sop_is_retired", message: "Retired SOPs cannot be edited." });
  if (sop.status === "active" && !hasRole(actor.role, SM_ROLES)) {
    return res.status(403).json({ error: "forbidden_active", message: "Only SM+ may edit an active SOP." });
  }

  const parsed = updateSopSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  // SM+ only fields
  const smOnlyFields: (keyof typeof data)[] = ["approverId", "effectiveDate", "reviewDueDate", "nextReviewDate"];
  for (const f of smOnlyFields) {
    if (f in data && data[f] !== undefined && !hasRole(actor.role, SM_ROLES)) {
      return res.status(403).json({ error: "forbidden_sm_field", message: `Field '${f}' requires SM+ role.` });
    }
  }

  const resolvedOwnerId    = data.ownerId !== undefined    ? data.ownerId    : sop.ownerId;
  const resolvedApproverId = data.approverId !== undefined ? data.approverId : sop.approverId;
  if (resolvedOwnerId && resolvedApproverId && resolvedOwnerId === resolvedApproverId) {
    return res.status(422).json({ error: "approver_must_differ_from_owner" });
  }

  const patchFields: Partial<typeof sop> = {};
  const auditEvents: { fieldName: string; oldValue: string; newValue: string }[] = [];

  function track<K extends keyof typeof sop>(field: K, newRaw: typeof sop[K] | undefined | null) {
    if (newRaw === undefined) return;
    const oldStr = sop[field] != null ? String(sop[field]) : "";
    const newStr = newRaw != null ? String(newRaw) : "";
    if (oldStr !== newStr) {
      (patchFields as any)[field] = newRaw;
      auditEvents.push({ fieldName: field as string, oldValue: oldStr, newValue: newStr });
    }
  }

  track("title", data.title);
  track("description", data.description);
  track("sopType", data.sopType);
  track("department", data.department);
  track("processArea", data.processArea);
  if ("documentReference" in data) track("documentReference", data.documentReference);
  if ("ownerId" in data) track("ownerId", data.ownerId);
  if ("approverId" in data) track("approverId", data.approverId);
  if ("effectiveDate" in data && data.effectiveDate !== undefined) {
    track("effectiveDate", data.effectiveDate ? new Date(data.effectiveDate) : null);
  }
  if ("reviewDueDate" in data && data.reviewDueDate !== undefined) {
    track("reviewDueDate", data.reviewDueDate ? new Date(data.reviewDueDate) : null);
  }
  if ("nextReviewDate" in data && data.nextReviewDate !== undefined) {
    track("nextReviewDate", data.nextReviewDate ? new Date(data.nextReviewDate) : null);
  }

  if (!Object.keys(patchFields).length) return res.json(sop);

  const [updated] = await db.update(oiSopRecords)
    .set({ ...patchFields, updatedAt: new Date() })
    .where(eq(oiSopRecords.id, sopId))
    .returning();

  for (const ev of auditEvents) {
    await writeSopAuditLog({
      sopId, action: "field_updated",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      fieldName: ev.fieldName, oldValue: ev.oldValue, newValue: ev.newValue,
      context: `SOP ${sop.sopNumber}`, ipAddress: actor.ip,
    });
  }

  return res.json(updated);
}));

// ─── 5. POST /sop/:sopId/transition ──────────────────────────────────────────
const transitionSchema = z.object({
  action:            z.enum(["submit","approve","reject","activate","retire"]),
  rejectionReason:   z.string().min(10).max(1000).optional(),
  retirementReason:  z.string().min(10).max(1000).optional(),
});

oiSopRouter.post("/sop/:sopId/transition", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const { action, rejectionReason, retirementReason } = parsed.data;

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  // ── SUBMIT: draft → under_review ─────────────────────────────────────────
  if (action === "submit") {
    if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (sop.status !== "draft") return res.status(422).json({ error: "sop_invalid_status", message: `SOP must be in draft to submit; current: ${sop.status}` });
    if (!sop.approverId) return res.status(422).json({ error: "sop_approver_required_for_submit", message: "An approver must be assigned before submission." });
    if (sop.approverId === sop.ownerId) return res.status(422).json({ error: "approver_must_differ_from_owner" });
    if (!hasRole(actor.role, SM_ROLES) && actor.id !== sop.ownerId) {
      return res.status(403).json({ error: "forbidden_not_owner" });
    }

    const [updated] = await db.update(oiSopRecords)
      .set({ status: "under_review", updatedAt: new Date() })
      .where(eq(oiSopRecords.id, sopId)).returning();

    await writeSopAuditLog({
      sopId, action: "sop_submitted_for_review",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      oldValue: "draft", newValue: "under_review",
      context: `SOP ${sop.sopNumber}`, ipAddress: actor.ip,
    });
    return res.json(updated);
  }

  // ── APPROVE: under_review → approved (revision_number 0→1) ───────────────
  if (action === "approve") {
    if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (sop.status !== "under_review") return res.status(422).json({ error: "sop_invalid_status", message: `SOP must be under_review to approve; current: ${sop.status}` });
    if (!hasRole(actor.role, ["Superuser"]) && sop.approverId && sop.approverId !== actor.id) {
      return res.status(403).json({ error: "forbidden_not_approver" });
    }

    const newRevisionNumber = sop.revisionNumber === 0 ? 1 : sop.revisionNumber;
    const [updated] = await db.update(oiSopRecords)
      .set({ status: "approved", revisionNumber: newRevisionNumber, updatedAt: new Date() })
      .where(eq(oiSopRecords.id, sopId)).returning();

    await writeSopAuditLog({
      sopId, action: "sop_approved",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      oldValue: "under_review", newValue: "approved",
      context: `SOP ${sop.sopNumber} revision_number=${newRevisionNumber}`, ipAddress: actor.ip,
    });
    return res.json(updated);
  }

  // ── REJECT: under_review → draft ─────────────────────────────────────────
  if (action === "reject") {
    if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (sop.status !== "under_review") return res.status(422).json({ error: "sop_invalid_status", message: `SOP must be under_review to reject; current: ${sop.status}` });
    if (!hasRole(actor.role, ["Superuser"]) && sop.approverId && sop.approverId !== actor.id) {
      return res.status(403).json({ error: "forbidden_not_approver" });
    }
    if (!rejectionReason || rejectionReason.trim().length < 10) {
      return res.status(422).json({ error: "rejection_reason_required", message: "Rejection reason must be at least 10 characters." });
    }

    const [updated] = await db.update(oiSopRecords)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(oiSopRecords.id, sopId)).returning();

    await writeSopAuditLog({
      sopId, action: "sop_rejected",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      oldValue: "under_review", newValue: "draft",
      context: `SOP ${sop.sopNumber} | Reason: ${rejectionReason}`, ipAddress: actor.ip,
    });
    return res.json(updated);
  }

  // ── ACTIVATE: approved → active (C3: 5 pre-conditions) ───────────────────
  if (action === "activate") {
    if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (sop.status !== "approved") return res.status(422).json({ error: "sop_invalid_status", message: `SOP must be approved to activate; current: ${sop.status}` });

    // C3 — 5 activation pre-conditions
    if (sop.revisionNumber < 1)   return res.status(422).json({ error: "sop_no_approved_revision",   message: "SOP cannot be activated without at least one approved revision." });
    if (!sop.ownerId)             return res.status(422).json({ error: "sop_owner_required",          message: "SOP cannot be activated without an owner assigned." });
    if (!sop.approverId)          return res.status(422).json({ error: "sop_approver_required",       message: "SOP cannot be activated without an approver assigned." });
    if (!sop.department)          return res.status(422).json({ error: "sop_department_required",     message: "SOP cannot be activated without a department assigned." });
    if (!sop.processArea)         return res.status(422).json({ error: "sop_process_area_required",   message: "SOP cannot be activated without a process area assigned." });

    const [updated] = await db.update(oiSopRecords)
      .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(oiSopRecords.id, sopId)).returning();

    // C1: Prior-revision acks are automatically obsolete — compliance counts only revision_number = sop.revisionNumber.
    await writeSopAuditLog({
      sopId, action: "sop_activated",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      oldValue: "approved", newValue: "active",
      context: `SOP ${sop.sopNumber} rev=${sop.revisionNumber}`, ipAddress: actor.ip,
    });
    return res.json(updated);
  }

  // ── RETIRE: (active|approved) → retired ──────────────────────────────────
  if (action === "retire") {
    if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    if (!["active","approved"].includes(sop.status)) {
      return res.status(422).json({ error: "sop_invalid_status", message: `SOP must be active or approved to retire; current: ${sop.status}` });
    }
    if (!retirementReason || retirementReason.trim().length < 10) {
      return res.status(422).json({ error: "retirement_reason_required", message: "Retirement reason must be at least 10 characters." });
    }

    // No pending revision gate
    const pending = await hasPendingRevision(sopId);
    if (pending) return res.status(422).json({ error: "sop_pending_revision", message: "Cannot retire a SOP with a pending revision in draft or under_review." });

    // Active CAPA gate
    const activeCapa = await db.execute(sql`
      SELECT l.id FROM oi_sop_linkages l
      JOIN oi_capa_records c ON c.id = l.linked_id
      WHERE l.sop_id = ${sopId} AND l.linked_type = 'capa'
        AND c.status NOT IN ('closed','cancelled')
      LIMIT 1
    `);
    if ((activeCapa as any).rows?.length > 0) {
      return res.status(422).json({ error: "sop_active_capa_linkage", message: "Cannot retire a SOP linked to an open/active CAPA." });
    }

    const [updated] = await db.update(oiSopRecords)
      .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
      .where(eq(oiSopRecords.id, sopId)).returning();

    await writeSopAuditLog({
      sopId, action: "sop_retired",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      oldValue: sop.status, newValue: "retired",
      context: `SOP ${sop.sopNumber} | Reason: ${retirementReason}`, ipAddress: actor.ip,
    });
    return res.json(updated);
  }

  return res.status(400).json({ error: "unknown_action" });
}));

// ─── 6. POST /sop/:sopId/revisions ────────────────────────────────────────────
const createRevisionSchema = z.object({
  changeSummary:   z.string().min(10).max(2000),
  changeRationale: z.string().min(10).max(2000),
});

oiSopRouter.post("/sop/:sopId/revisions", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  // C4: Retired SOP blocks new revisions
  if (sop.status === "retired") return res.status(422).json({ error: "sop_retired", message: "Retired SOPs cannot receive new revisions." });
  if (!["active","approved"].includes(sop.status)) {
    return res.status(422).json({ error: "sop_invalid_status", message: "Revisions can only be created when the SOP is active or approved." });
  }

  // No duplicate pending revision
  const pending = await hasPendingRevision(sopId);
  if (pending) return res.status(409).json({ error: "revision_already_pending", message: "A revision is already pending for this SOP." });

  const parsed = createRevisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  const newRevNum = sop.revisionNumber + 1;
  const [rev] = await db.insert(oiSopRevisions).values({
    sopId,
    revisionNumber:  newRevNum,
    changeSummary:   data.changeSummary,
    changeRationale: data.changeRationale,
    createdBy:       actor.id,
  }).returning();

  await writeSopAuditLog({
    sopId, action: "sop_revised",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} | New revision ${newRevNum} created`, ipAddress: actor.ip,
  });

  return res.status(201).json(rev);
}));

// ─── 7. GET /sop/:sopId/revisions ────────────────────────────────────────────
oiSopRouter.get("/sop/:sopId/revisions", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const revisions = await db.select().from(oiSopRevisions)
    .where(eq(oiSopRevisions.sopId, sopId))
    .orderBy(desc(oiSopRevisions.revisionNumber));

  return res.json(revisions);
}));

// ─── 8. PATCH /sop/:sopId/revisions/:revId ────────────────────────────────────
const updateRevisionSchema = z.object({
  changeSummary:   z.string().min(10).max(2000).optional(),
  changeRationale: z.string().min(10).max(2000).optional(),
});

oiSopRouter.patch("/sop/:sopId/revisions/:revId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  const revId = parseInt(req.params.revId);
  if (isNaN(sopId) || isNaN(revId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const [rev] = await db.select().from(oiSopRevisions)
    .where(and(eq(oiSopRevisions.id, revId), eq(oiSopRevisions.sopId, sopId))).limit(1);
  if (!rev) return res.status(404).json({ error: "revision_not_found" });
  if (rev.status !== "draft") return res.status(422).json({ error: "revision_not_draft", message: "Only draft revisions can be edited." });

  // Must be owner or SM+
  if (!hasRole(actor.role, SM_ROLES) && actor.id !== sop.ownerId) {
    return res.status(403).json({ error: "forbidden_not_owner" });
  }

  const parsed = updateRevisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  const [updated] = await db.update(oiSopRevisions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(oiSopRevisions.id, revId)).returning();

  await writeSopAuditLog({
    sopId, action: "field_updated",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    fieldName: "revision_draft", context: `SOP ${sop.sopNumber} rev ${rev.revisionNumber}`, ipAddress: actor.ip,
  });

  return res.json(updated);
}));

// ─── 9. POST /sop/:sopId/revisions/:revId/submit ──────────────────────────────
oiSopRouter.post("/sop/:sopId/revisions/:revId/submit", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  const revId = parseInt(req.params.revId);
  if (isNaN(sopId) || isNaN(revId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  if (!hasRole(actor.role, SM_ROLES) && actor.id !== sop.ownerId) {
    return res.status(403).json({ error: "forbidden_not_owner" });
  }

  const [rev] = await db.select().from(oiSopRevisions)
    .where(and(eq(oiSopRevisions.id, revId), eq(oiSopRevisions.sopId, sopId))).limit(1);
  if (!rev) return res.status(404).json({ error: "revision_not_found" });
  if (rev.status !== "draft") return res.status(422).json({ error: "revision_not_draft", message: "Only draft revisions can be submitted." });
  if (rev.changeSummary.trim().length < 10) return res.status(422).json({ error: "change_summary_too_short" });
  if (rev.changeRationale.trim().length < 10) return res.status(422).json({ error: "change_rationale_too_short" });

  const [updated] = await db.update(oiSopRevisions)
    .set({ status: "under_review", submittedBy: actor.id, submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(oiSopRevisions.id, revId)).returning();

  await writeSopAuditLog({
    sopId, action: "sop_submitted_for_review",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} revision ${rev.revisionNumber}`, ipAddress: actor.ip,
  });

  return res.json(updated);
}));

// ─── 10. POST /sop/:sopId/revisions/:revId/approve ────────────────────────────
oiSopRouter.post("/sop/:sopId/revisions/:revId/approve", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  const revId = parseInt(req.params.revId);
  if (isNaN(sopId) || isNaN(revId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  if (!hasRole(actor.role, ["Superuser"]) && sop.approverId && sop.approverId !== actor.id) {
    return res.status(403).json({ error: "forbidden_not_approver" });
  }

  const [rev] = await db.select().from(oiSopRevisions)
    .where(and(eq(oiSopRevisions.id, revId), eq(oiSopRevisions.sopId, sopId))).limit(1);
  if (!rev) return res.status(404).json({ error: "revision_not_found" });
  if (rev.status !== "under_review") return res.status(422).json({ error: "revision_not_under_review" });

  const now = new Date();
  const [updatedRev] = await db.update(oiSopRevisions)
    .set({ status: "approved", approvedBy: actor.id, approvedAt: now, updatedAt: now })
    .where(eq(oiSopRevisions.id, revId)).returning();

  // SOP: increment revision_number, return to approved (requires re-activation)
  const newSopStatus = sop.status === "active" ? "approved" : sop.status;
  const [updatedSop] = await db.update(oiSopRecords)
    .set({ revisionNumber: rev.revisionNumber, status: newSopStatus, updatedAt: now })
    .where(eq(oiSopRecords.id, sopId)).returning();

  await writeSopAuditLog({
    sopId, action: "sop_approved",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} revision ${rev.revisionNumber} approved; sop_status→${newSopStatus}`, ipAddress: actor.ip,
  });

  return res.json({ revision: updatedRev, sop: updatedSop });
}));

// ─── 11. POST /sop/:sopId/revisions/:revId/reject ─────────────────────────────
const rejectRevisionSchema = z.object({
  rejectionReason: z.string().min(10).max(1000),
});

oiSopRouter.post("/sop/:sopId/revisions/:revId/reject", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  const revId = parseInt(req.params.revId);
  if (isNaN(sopId) || isNaN(revId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  if (!hasRole(actor.role, ["Superuser"]) && sop.approverId && sop.approverId !== actor.id) {
    return res.status(403).json({ error: "forbidden_not_approver" });
  }

  const parsed = rejectRevisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [rev] = await db.select().from(oiSopRevisions)
    .where(and(eq(oiSopRevisions.id, revId), eq(oiSopRevisions.sopId, sopId))).limit(1);
  if (!rev) return res.status(404).json({ error: "revision_not_found" });
  if (rev.status !== "under_review") return res.status(422).json({ error: "revision_not_under_review" });

  const now = new Date();
  const [updated] = await db.update(oiSopRevisions)
    .set({ status: "rejected", rejectedBy: actor.id, rejectedAt: now, rejectionReason: parsed.data.rejectionReason, updatedAt: now })
    .where(eq(oiSopRevisions.id, revId)).returning();

  await writeSopAuditLog({
    sopId, action: "sop_rejected",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} revision ${rev.revisionNumber} | ${parsed.data.rejectionReason}`, ipAddress: actor.ip,
  });

  return res.json(updated);
}));

// ─── 12. POST /sop/:sopId/linkages — Add Linkage ─────────────────────────────
const addLinkageSchema = z.object({
  linkedType: z.enum(["issue","rca","capa"]),
  linkedId:   z.number().int().positive(),
  linkNote:   z.string().min(3).max(500),
});

oiSopRouter.post("/sop/:sopId/linkages", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });
  // C4: Retired SOP blocks new linkages
  if (sop.status === "retired") return res.status(422).json({ error: "sop_retired", message: "Retired SOPs cannot receive new linkages." });

  const parsed = addLinkageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const { linkedType, linkedId, linkNote } = parsed.data;

  // Validate the linked entity exists
  if (linkedType === "issue") {
    const [row] = await db.select({ id: oiIssues.id }).from(oiIssues).where(eq(oiIssues.id, linkedId)).limit(1);
    if (!row) return res.status(404).json({ error: "linked_entity_not_found", linkedType });
  } else if (linkedType === "rca") {
    const [row] = await db.select({ id: oiRcaRecords.id }).from(oiRcaRecords).where(eq(oiRcaRecords.id, linkedId)).limit(1);
    if (!row) return res.status(404).json({ error: "linked_entity_not_found", linkedType });
  } else if (linkedType === "capa") {
    const [row] = await db.select({ id: oiCapaRecords.id }).from(oiCapaRecords).where(eq(oiCapaRecords.id, linkedId)).limit(1);
    if (!row) return res.status(404).json({ error: "linked_entity_not_found", linkedType });
  }

  // Duplicate check
  const existing = await db.select({ id: oiSopLinkages.id }).from(oiSopLinkages)
    .where(and(
      eq(oiSopLinkages.sopId, sopId),
      eq(oiSopLinkages.linkedType, linkedType),
      eq(oiSopLinkages.linkedId, linkedId),
    )).limit(1);
  if (existing.length) return res.status(409).json({ error: "linkage_duplicate", message: "This entity is already linked to the SOP." });

  const [linkage] = await db.insert(oiSopLinkages).values({
    sopId, linkedType, linkedId, linkNote, linkedBy: actor.id,
  }).returning();

  await writeSopAuditLog({
    sopId, action: "sop_linked",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    fieldName: `${linkedType}:${linkedId}`,
    context: `SOP ${sop.sopNumber}`, ipAddress: actor.ip,
  });

  return res.status(201).json(linkage);
}));

// ─── 13. GET /sop/:sopId/linkages ────────────────────────────────────────────
oiSopRouter.get("/sop/:sopId/linkages", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });
  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const linkages = await db.select().from(oiSopLinkages)
    .where(eq(oiSopLinkages.sopId, sopId))
    .orderBy(desc(oiSopLinkages.createdAt));

  return res.json(linkages);
}));

// ─── 14. DELETE /sop/:sopId/linkages/:linkageId — Remove Linkage (C5) ────────
oiSopRouter.delete("/sop/:sopId/linkages/:linkageId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId     = parseInt(req.params.sopId);
  const linkageId = parseInt(req.params.linkageId);
  if (isNaN(sopId) || isNaN(linkageId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const [linkage] = await db.select().from(oiSopLinkages)
    .where(and(eq(oiSopLinkages.id, linkageId), eq(oiSopLinkages.sopId, sopId))).limit(1);
  if (!linkage) return res.status(404).json({ error: "linkage_not_found" });

  await db.delete(oiSopLinkages).where(eq(oiSopLinkages.id, linkageId));

  // C5: sop_unlinked audit — fieldName carries linkedType:linkedId
  await writeSopAuditLog({
    sopId, action: "sop_unlinked",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    fieldName: `${linkage.linkedType}:${linkage.linkedId}`,
    context: `SOP ${sop.sopNumber}`, ipAddress: actor.ip,
  });

  return res.json({ success: true, deleted: linkageId });
}));

// ─── 15. GET /issues/:id/sop — SOPs linked to an issue ───────────────────────
oiSopRouter.get("/issues/:id/sop", wrap(async (req: any, res: any) => {
  const issueId = parseInt(req.params.id);
  if (isNaN(issueId)) return res.status(400).json({ error: "invalid_id" });

  const linkages = await db.select({ sopId: oiSopLinkages.sopId })
    .from(oiSopLinkages)
    .where(and(eq(oiSopLinkages.linkedType, "issue"), eq(oiSopLinkages.linkedId, issueId)));

  if (!linkages.length) return res.json([]);

  const sopIds = linkages.map(l => l.sopId);
  const sops   = await db.select().from(oiSopRecords).where(inArray(oiSopRecords.id, sopIds));
  return res.json(sops);
}));

// ─── 16. GET /capa/:capaId/sop — SOPs linked to a CAPA ──────────────────────
oiSopRouter.get("/capa/:capaId/sop", wrap(async (req: any, res: any) => {
  const capaId = parseInt(req.params.capaId);
  if (isNaN(capaId)) return res.status(400).json({ error: "invalid_id" });

  const linkages = await db.select({ sopId: oiSopLinkages.sopId })
    .from(oiSopLinkages)
    .where(and(eq(oiSopLinkages.linkedType, "capa"), eq(oiSopLinkages.linkedId, capaId)));

  if (!linkages.length) return res.json([]);

  const sopIds = linkages.map(l => l.sopId);
  const sops   = await db.select().from(oiSopRecords).where(inArray(oiSopRecords.id, sopIds));
  return res.json(sops);
}));

// ─── 17. GET /rca/:rcaId/sop — SOPs linked to an RCA ────────────────────────
oiSopRouter.get("/rca/:rcaId/sop", wrap(async (req: any, res: any) => {
  const rcaId = parseInt(req.params.rcaId);
  if (isNaN(rcaId)) return res.status(400).json({ error: "invalid_id" });

  const linkages = await db.select({ sopId: oiSopLinkages.sopId })
    .from(oiSopLinkages)
    .where(and(eq(oiSopLinkages.linkedType, "rca"), eq(oiSopLinkages.linkedId, rcaId)));

  if (!linkages.length) return res.json([]);

  const sopIds = linkages.map(l => l.sopId);
  const sops   = await db.select().from(oiSopRecords).where(inArray(oiSopRecords.id, sopIds));
  return res.json(sops);
}));

// ─── 18. POST /sop/:sopId/acknowledgments — Assign Acks (C2, C6) ─────────────
const assignAckSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(50),
  dueDate: z.string().datetime().optional(),
});

oiSopRouter.post("/sop/:sopId/acknowledgments", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  // C4: Retired gate (already covered by the 'active' check below, but explicit)
  if (sop.status === "retired") return res.status(422).json({ error: "sop_retired", message: "Retired SOPs cannot receive acknowledgment assignments." });

  // C2: Ack assignment gate — status=active AND revisionNumber>=1 AND no pending revision
  if (sop.status !== "active") {
    return res.status(422).json({ error: "sop_not_ready_for_acknowledgment", message: "Acknowledgment assignments require an active SOP." });
  }
  if (sop.revisionNumber < 1) {
    return res.status(422).json({ error: "sop_not_ready_for_acknowledgment", message: "SOP must have at least one approved revision (revision_number ≥ 1)." });
  }
  const pending = await hasPendingRevision(sopId);
  if (pending) {
    return res.status(422).json({ error: "sop_not_ready_for_acknowledgment", message: "Cannot assign acknowledgments while a revision is in draft or under review." });
  }

  const parsed = assignAckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const { userIds, dueDate } = parsed.data;

  const created: any[] = [];
  const skipped: number[] = [];

  for (const userId of userIds) {
    // Check for duplicate (already assigned for this revision)
    const existing = await db.select({ id: oiSopAcknowledgments.id }).from(oiSopAcknowledgments)
      .where(and(
        eq(oiSopAcknowledgments.sopId, sopId),
        eq(oiSopAcknowledgments.revisionNumber, sop.revisionNumber),
        eq(oiSopAcknowledgments.userId, userId),
      )).limit(1);

    if (existing.length) { skipped.push(userId); continue; }

    const [ack] = await db.insert(oiSopAcknowledgments).values({
      sopId,
      revisionNumber: sop.revisionNumber,
      userId,
      assignedBy: actor.id,
      dueDate: dueDate ? new Date(dueDate) : null,
    }).returning();

    created.push(ack);

    // C6: Mandatory audit event per assigned user
    await writeSopAuditLog({
      sopId, action: "sop_acknowledgment_assigned",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      context: `SOP ${sop.sopNumber} rev=${sop.revisionNumber} user_id=${userId}`, ipAddress: actor.ip,
    });
  }

  return res.status(201).json({ created, skipped });
}));

// ─── 19. GET /sop/:sopId/acknowledgments ─────────────────────────────────────
oiSopRouter.get("/sop/:sopId/acknowledgments", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  // Default to current revision (C1: prior acks excluded from compliance)
  const revNum = req.query.revisionNumber ? parseInt(req.query.revisionNumber as string) : sop.revisionNumber;

  const acks = await db.select({
    id:                 oiSopAcknowledgments.id,
    sopId:              oiSopAcknowledgments.sopId,
    revisionNumber:     oiSopAcknowledgments.revisionNumber,
    userId:             oiSopAcknowledgments.userId,
    assignedBy:         oiSopAcknowledgments.assignedBy,
    assignedAt:         oiSopAcknowledgments.assignedAt,
    dueDate:            oiSopAcknowledgments.dueDate,
    acknowledgedAt:     oiSopAcknowledgments.acknowledgedAt,
    acknowledgmentNote: oiSopAcknowledgments.acknowledgmentNote,
    userName:           users.username,
  })
  .from(oiSopAcknowledgments)
  .leftJoin(users, eq(users.id, oiSopAcknowledgments.userId))
  .where(and(
    eq(oiSopAcknowledgments.sopId, sopId),
    eq(oiSopAcknowledgments.revisionNumber, revNum),
  ))
  .orderBy(asc(oiSopAcknowledgments.assignedAt));

  const now = new Date();
  return res.json(acks.map(r => ({
    ...r,
    isOverdue: !r.acknowledgedAt && r.dueDate != null && r.dueDate < now,
    isCurrentRevision: r.revisionNumber === sop.revisionNumber,
  })));
}));

// ─── 20. POST /sop/:sopId/acknowledgments/:ackId/acknowledge (C6) ─────────────
const acknowledgeSchema = z.object({
  acknowledgmentNote: z.string().max(500).optional(),
});

oiSopRouter.post("/sop/:sopId/acknowledgments/:ackId/acknowledge", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const sopId = parseInt(req.params.sopId);
  const ackId = parseInt(req.params.ackId);
  if (isNaN(sopId) || isNaN(ackId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const [ack] = await db.select().from(oiSopAcknowledgments)
    .where(and(eq(oiSopAcknowledgments.id, ackId), eq(oiSopAcknowledgments.sopId, sopId))).limit(1);
  if (!ack) return res.status(404).json({ error: "ack_not_found" });

  // Only the assigned user or Superuser may acknowledge
  if (actor.id !== ack.userId && actor.role !== "Superuser") {
    return res.status(403).json({ error: "forbidden_not_assignee" });
  }
  if (ack.acknowledgedAt) return res.status(409).json({ error: "already_acknowledged" });

  const parsed = acknowledgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [updated] = await db.update(oiSopAcknowledgments)
    .set({ acknowledgedAt: new Date(), acknowledgmentNote: parsed.data.acknowledgmentNote ?? null })
    .where(eq(oiSopAcknowledgments.id, ackId)).returning();

  // C6: Mandatory sop_acknowledged audit
  await writeSopAuditLog({
    sopId, action: "sop_acknowledged",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} rev=${ack.revisionNumber} ack_id=${ackId}`, ipAddress: actor.ip,
  });

  return res.json(updated);
}));

// ─── 21. DELETE /sop/:sopId/acknowledgments/:ackId — Withdraw (C6) ────────────
oiSopRouter.delete("/sop/:sopId/acknowledgments/:ackId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  const ackId = parseInt(req.params.ackId);
  if (isNaN(sopId) || isNaN(ackId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const [ack] = await db.select().from(oiSopAcknowledgments)
    .where(and(eq(oiSopAcknowledgments.id, ackId), eq(oiSopAcknowledgments.sopId, sopId))).limit(1);
  if (!ack) return res.status(404).json({ error: "ack_not_found" });
  if (ack.acknowledgedAt) return res.status(422).json({ error: "cannot_withdraw_acknowledged", message: "Cannot withdraw an already-acknowledged assignment." });

  await db.delete(oiSopAcknowledgments).where(eq(oiSopAcknowledgments.id, ackId));

  // C6: Mandatory sop_acknowledgment_withdrawn audit
  await writeSopAuditLog({
    sopId, action: "sop_acknowledgment_withdrawn",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} rev=${ack.revisionNumber} user_id=${ack.userId}`, ipAddress: actor.ip,
  });

  return res.json({ success: true, deleted: ackId });
}));

// ─── 22. POST /sop/:sopId/effectiveness — Record Review (C7) ─────────────────
const effectivenessSchema = z.object({
  effectivenessScore: z.number().int().min(1).max(5),
  isEffective:        z.boolean(),
  deviationObserved:  z.boolean().optional().default(false),
  requiresRevision:   z.boolean().optional().default(false),
  evidenceNotes:      z.string().max(2000).optional(),
  recommendation:     z.string().max(2000).optional(),
});

oiSopRouter.post("/sop/:sopId/effectiveness", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });

  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });
  // C4: Retired SOP blocks effectiveness reviews
  if (sop.status === "retired") return res.status(422).json({ error: "sop_retired", message: "Retired SOPs cannot receive effectiveness reviews." });
  if (sop.status !== "active") return res.status(422).json({ error: "sop_not_active", message: "Effectiveness reviews require an active SOP." });

  const parsed = effectivenessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
  const data = parsed.data;

  // C7: Contradiction rule — isEffective=TRUE AND requiresRevision=TRUE
  if (data.isEffective && data.requiresRevision) {
    return res.status(422).json({ error: "contradiction", message: "A SOP marked effective cannot simultaneously require revision." });
  }
  // Contradiction rule 1: isEffective=TRUE AND deviationObserved=TRUE is a soft warning, not a hard block per spec
  if (data.isEffective && data.deviationObserved) {
    return res.status(422).json({ error: "contradiction", message: "A SOP marked effective cannot simultaneously report deviation observed." });
  }
  if (!data.isEffective && (!data.recommendation || data.recommendation.trim().length < 5)) {
    return res.status(422).json({ error: "recommendation_required", message: "Recommendation is required when SOP is marked ineffective." });
  }

  // Compute next review cycle
  const cycles = await db.select({ cnt: count() }).from(oiSopEffectiveness).where(eq(oiSopEffectiveness.sopId, sopId));
  const nextCycle = Number(cycles[0]?.cnt ?? 0) + 1;

  const [review] = await db.insert(oiSopEffectiveness).values({
    sopId,
    reviewCycle:        nextCycle,
    reviewerId:         actor.id,
    effectivenessScore: data.effectivenessScore,
    isEffective:        data.isEffective,
    deviationObserved:  data.deviationObserved ?? false,
    requiresRevision:   data.requiresRevision ?? false,
    evidenceNotes:      data.evidenceNotes ?? null,
    recommendation:     data.recommendation ?? null,
  }).returning();

  await writeSopAuditLog({
    sopId, action: "sop_effectiveness_recorded",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `SOP ${sop.sopNumber} cycle=${nextCycle} score=${data.effectivenessScore} effective=${data.isEffective}`, ipAddress: actor.ip,
  });

  return res.status(201).json(review);
}));

// ─── 23. GET /sop/:sopId/effectiveness ───────────────────────────────────────
oiSopRouter.get("/sop/:sopId/effectiveness", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });
  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const reviews = await db.select({
    id:                 oiSopEffectiveness.id,
    sopId:              oiSopEffectiveness.sopId,
    reviewCycle:        oiSopEffectiveness.reviewCycle,
    reviewerId:         oiSopEffectiveness.reviewerId,
    reviewedAt:         oiSopEffectiveness.reviewedAt,
    effectivenessScore: oiSopEffectiveness.effectivenessScore,
    isEffective:        oiSopEffectiveness.isEffective,
    deviationObserved:  oiSopEffectiveness.deviationObserved,
    requiresRevision:   oiSopEffectiveness.requiresRevision,
    evidenceNotes:      oiSopEffectiveness.evidenceNotes,
    recommendation:     oiSopEffectiveness.recommendation,
    reviewerName:       users.username,
  })
  .from(oiSopEffectiveness)
  .leftJoin(users, eq(users.id, oiSopEffectiveness.reviewerId))
  .where(eq(oiSopEffectiveness.sopId, sopId))
  .orderBy(desc(oiSopEffectiveness.reviewCycle));

  return res.json(reviews);
}));

// ─── 24. GET /dashboard/sop-summary ──────────────────────────────────────────
oiSopRouter.get("/dashboard/sop-summary", wrap(async (req: any, res: any) => {
  const { periodDays = "30" } = req.query;
  const days = parseInt(periodDays as string) || 30;
  const now  = new Date();
  const from = new Date(now.getTime() - days * 86400000);

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                           AS total_sop,
      COUNT(*) FILTER (WHERE status = 'draft')::int                          AS draft_count,
      COUNT(*) FILTER (WHERE status = 'under_review')::int                   AS under_review_count,
      COUNT(*) FILTER (WHERE status = 'approved')::int                       AS approved_count,
      COUNT(*) FILTER (WHERE status = 'active')::int                         AS active_count,
      COUNT(*) FILTER (WHERE status = 'retired')::int                        AS retired_count,
      COUNT(*) FILTER (WHERE status='active' AND review_due_date < NOW())::int AS review_overdue_count,
      COUNT(*) FILTER (WHERE created_at >= ${from})::int                     AS new_in_period
    FROM oi_sop_records
  `);

  const row = (result as any).rows?.[0] ?? {};

  // Pending ack count across all active SOPs (current revision only)
  const ackResult = await db.execute(sql`
    SELECT COUNT(*)::int AS pending_ack_count
    FROM oi_sop_acknowledgments a
    JOIN oi_sop_records s ON s.id = a.sop_id
    WHERE a.acknowledged_at IS NULL AND a.revision_number = s.revision_number
  `);
  const pendingAckCount = Number((ackResult as any).rows?.[0]?.pending_ack_count ?? 0);

  return res.json({
    totalSop:           Number(row.total_sop ?? 0),
    draftCount:         Number(row.draft_count ?? 0),
    underReviewCount:   Number(row.under_review_count ?? 0),
    approvedCount:      Number(row.approved_count ?? 0),
    activeCount:        Number(row.active_count ?? 0),
    retiredCount:       Number(row.retired_count ?? 0),
    reviewOverdueCount: Number(row.review_overdue_count ?? 0),
    newInPeriod:        Number(row.new_in_period ?? 0),
    pendingAckCount,
    periodDays:         days,
  });
}));

// ─── 25. GET /dashboard/sop-acknowledgment ────────────────────────────────────
oiSopRouter.get("/dashboard/sop-acknowledgment", wrap(async (req: any, res: any) => {
  const result = await db.execute(sql`
    SELECT
      s.department,
      COUNT(a.id)::int                                                              AS total_assigned,
      COUNT(a.id) FILTER (WHERE a.acknowledged_at IS NOT NULL)::int                 AS acknowledged,
      COUNT(a.id) FILTER (WHERE a.acknowledged_at IS NULL)::int                     AS pending,
      COUNT(a.id) FILTER (WHERE a.acknowledged_at IS NULL AND a.due_date < NOW())::int AS overdue,
      ROUND(
        100.0 * COUNT(a.id) FILTER (WHERE a.acknowledged_at IS NOT NULL)
        / NULLIF(COUNT(a.id), 0), 1
      )::float AS acknowledgment_rate_pct
    FROM oi_sop_acknowledgments a
    JOIN oi_sop_records s ON s.id = a.sop_id
    WHERE a.revision_number = s.revision_number
    GROUP BY s.department
    ORDER BY s.department
  `);

  return res.json((result as any).rows ?? []);
}));

// ─── 26. GET /dashboard/sop-effectiveness ────────────────────────────────────
oiSopRouter.get("/dashboard/sop-effectiveness", wrap(async (req: any, res: any) => {
  const { periodDays = "90" } = req.query;
  const days = parseInt(periodDays as string) || 90;
  const from = new Date(Date.now() - days * 86400000);

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                        AS total_reviews,
      COUNT(*) FILTER (WHERE is_effective = true)::int                    AS effective_count,
      COUNT(*) FILTER (WHERE is_effective = false)::int                   AS ineffective_count,
      COUNT(*) FILTER (WHERE deviation_observed = true)::int              AS deviation_observed_count,
      COUNT(*) FILTER (WHERE requires_revision = true)::int               AS requires_revision_count,
      ROUND(AVG(effectiveness_score)::numeric, 2)::float                  AS avg_score,
      COUNT(*) FILTER (WHERE reviewed_at >= ${from})::int                 AS reviews_in_period,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE is_effective = true)
        / NULLIF(COUNT(*), 0), 1
      )::float AS effectiveness_rate_pct
    FROM oi_sop_effectiveness
  `);

  return res.json((result as any).rows?.[0] ?? {});
}));

// ─── 27. GET /dashboard/sop-by-department ─────────────────────────────────────
oiSopRouter.get("/dashboard/sop-by-department", wrap(async (req: any, res: any) => {
  const result = await db.execute(sql`
    SELECT
      s.department,
      COUNT(s.id)::int                                                              AS active_count,
      COUNT(s.id) FILTER (WHERE s.review_due_date < NOW())::int                    AS review_overdue_count,
      COALESCE((
        SELECT COUNT(a.id)::int
        FROM oi_sop_acknowledgments a
        WHERE a.sop_id = s.id AND a.revision_number = s.revision_number AND a.acknowledged_at IS NULL
      ), 0)::int                                                                    AS pending_ack_count
    FROM oi_sop_records s
    WHERE s.status = 'active'
    GROUP BY s.department
    ORDER BY s.department
  `);

  return res.json((result as any).rows ?? []);
}));

// ─── Audit Log for a SOP ──────────────────────────────────────────────────────
oiSopRouter.get("/sop/:sopId/audit-log", wrap(async (req: any, res: any) => {
  const sopId = parseInt(req.params.sopId);
  if (isNaN(sopId)) return res.status(400).json({ error: "invalid_id" });
  const sop = await fetchSop(sopId);
  if (!sop) return res.status(404).json({ error: "sop_not_found" });

  const logs = await db.select().from(oiSopAuditLog)
    .where(eq(oiSopAuditLog.sopId, sopId))
    .orderBy(desc(oiSopAuditLog.createdAt))
    .limit(200);

  return res.json(logs);
}));
