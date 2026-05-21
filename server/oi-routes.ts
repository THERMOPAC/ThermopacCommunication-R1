import { Router } from "express";
import { db } from "./db";
import {
  oiIssues, oiAuditLog, oiEscalations, oiRiskWeightConfig, oiRiskMatrixConfig,
  insertOiIssueSchema, OiIssue, users,
} from "@shared/schema";
import { eq, and, or, desc, asc, ilike, count, lt, isNotNull, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "./oi-audit-service";
import { validateTransition, TransitionError, getAllowedTransitions } from "./oi-transition-service";
import {
  triggerS1ImmediateEscalation,
  triggerSafetyEscalation,
  triggerStatutoryEscalation,
  triggerFinancialEscalation,
} from "./oi-escalation-service";
import { createNotification } from "./notification-routes";

export const oiRouter = Router();

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES = ["Senior Manager", "General Manager", "Superuser"];
const GM_ROLES = ["General Manager", "Superuser"];

function actorFromReq(req: any) {
  return {
    id: req.user.id as number,
    name: (req.user.name || req.user.username || "Unknown") as string,
    role: (req.user.role || "Employee") as string,
    ip: (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "") as string,
  };
}

function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

// ─── Issue number generation ─────────────────────────────────────────────────
async function generateIssueNumber(): Promise<string> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const year = istDate.getFullYear();
  const prefix = `OI-${year}-`;
  const existing = await db.select({ issueNumber: oiIssues.issueNumber })
    .from(oiIssues)
    .where(ilike(oiIssues.issueNumber, `${prefix}%`));
  const seq = existing.length + 1;
  return `${prefix}${seq.toString().padStart(4, "0")}`;
}

// ─── Risk score computation ───────────────────────────────────────────────────
const PROB_WEIGHT: Record<string, number> = {
  very_low: 1, low: 2, medium: 3, high: 4, very_high: 5,
};
const IMPACT_WEIGHT: Record<string, number> = {
  negligible: 1, minor: 2, moderate: 3, major: 4, catastrophic: 5,
};

async function computeRiskScore(probabilityLevel?: string | null, impactLevel?: string | null) {
  if (!probabilityLevel || !impactLevel) return { riskScore: null, riskRating: null };
  const p = PROB_WEIGHT[probabilityLevel] ?? 0;
  const i = IMPACT_WEIGHT[impactLevel] ?? 0;
  const score = p * i;
  const matrix = await db.select()
    .from(oiRiskMatrixConfig)
    .where(and(eq(oiRiskMatrixConfig.probability, p), eq(oiRiskMatrixConfig.impact, i)));
  const rating = matrix[0]?.riskRating ?? (
    score <= 4 ? "low" : score <= 9 ? "medium" : score <= 19 ? "high" : "critical"
  ) as any;
  return { riskScore: score, riskRating: rating };
}

// ─── SLA computation ──────────────────────────────────────────────────────────
const SLA_RESPONSE_HOURS: Record<string, number> = { S1: 24, S2: 72, S3: 168, S4: 720 };
const SLA_CLOSURE_DAYS:   Record<string, number> = { S1: 30, S2: 60, S3: 90,  S4: 180 };

function computeSla(severity: string, from: Date) {
  const responseHours = SLA_RESPONSE_HOURS[severity] ?? 168;
  const closureDays   = SLA_CLOSURE_DAYS[severity]   ?? 90;
  const responseDueAt = new Date(from.getTime() + responseHours * 3600 * 1000);
  const closureDueAt  = new Date(from.getTime() + closureDays  * 86400 * 1000);
  return { responseDueAt, closureDueAt };
}

// ─── Visibility scope ─────────────────────────────────────────────────────────
function buildVisibilityWhere(userId: number, role: string) {
  if (hasRole(role, GM_ROLES)) return undefined;
  if (role === "Senior Manager" || role === "Manager") return undefined; // dept-level — simplified to all for now
  return or(eq(oiIssues.reportedBy, userId), eq(oiIssues.assignedTo, userId));
}

// ─── Validation schemas ───────────────────────────────────────────────────────
const createIssueBodySchema = z.object({
  title:         z.string().min(1).max(500),
  description:   z.string().min(1),
  category:      z.enum(["QC","DWG","PROC","MFG","SITE","COMM","LOG","DOC","SAP","COMP","SAFETY","FIN","LEGAL","HR","CUST","SYS","INT","OTHER"]),
  projectPhase:  z.enum(["SALES","ENG","DVS","PROC","MFG","QC","FAT","DISP","LOG","SITE","ERECT","SAT","COMM","PERF","WARR","AFTS"]),
  severity:      z.enum(["S1","S2","S3","S4"]),
  projectId:     z.number().int().positive().optional().nullable(),
  subCategory:   z.string().max(200).optional().nullable(),
  occurredAt:    z.string().datetime().optional().nullable(),
  detectedAt:    z.string().datetime().optional().nullable(),
  equipmentFamily:  z.string().optional().nullable(),
  equipmentType:    z.string().optional().nullable(),
  packageType:      z.string().optional().nullable(),
  processSystem:    z.string().optional().nullable(),
  utilitySystem:    z.string().optional().nullable(),
  skidSystem:       z.string().optional().nullable(),
  customerIndustry: z.string().optional().nullable(),
  criticalEquipmentFlag: z.boolean().optional(),
  criticalPathFlag:      z.boolean().optional(),
  projectComplexity:     z.string().optional().nullable(),
}).strict();

const transitionBodySchema = z.object({
  to:     z.string().min(1),
  reason: z.string().optional(),
});

const severityChangeSchema = z.object({
  severity: z.enum(["S1","S2","S3","S4"]),
  reason:   z.string().min(1),
});

const assignSchema = z.object({
  userId: z.number().int().positive(),
});

// ─── POST /api/oi/issues ─────────────────────────────────────────────────────
oiRouter.post("/issues", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const parsed = createIssueBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const body = parsed.data;
  const issueNumber = await generateIssueNumber();

  const [issue] = await db.insert(oiIssues).values({
    issueNumber,
    title:        body.title,
    description:  body.description,
    category:     body.category as any,
    subCategory:  body.subCategory ?? null,
    projectPhase: body.projectPhase as any,
    severity:     body.severity as any,
    status:       "captured",
    projectId:    body.projectId ?? null,
    occurredAt:   body.occurredAt ? new Date(body.occurredAt) : null,
    detectedAt:   body.detectedAt ? new Date(body.detectedAt) : null,
    equipmentFamily:      body.equipmentFamily ?? null,
    equipmentType:        body.equipmentType ?? null,
    packageType:          body.packageType ?? null,
    processSystem:        body.processSystem ?? null,
    utilitySystem:        body.utilitySystem ?? null,
    skidSystem:           body.skidSystem ?? null,
    customerIndustry:     body.customerIndustry ?? null,
    criticalEquipmentFlag: body.criticalEquipmentFlag ?? false,
    criticalPathFlag:      body.criticalPathFlag ?? false,
    projectComplexity:     body.projectComplexity ?? null,
    reportedBy: actor.id,
  }).returning();

  await writeAuditLog({
    issueId: issue.id, action: "created",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: `Issue captured: ${issueNumber}`,
    ipAddress: actor.ip,
  });

  // S1 immediate escalation
  if (issue.severity === "S1") {
    await triggerS1ImmediateEscalation(issue as any, actor.id);
  }

  return res.status(201).json(issue);
});

// ─── GET /api/oi/issues ──────────────────────────────────────────────────────
oiRouter.get("/issues", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const { status, severity, category, projectPhase, search, slaBreached, page = "1", limit = "25" } = req.query;

  const pageNum  = Math.max(1, parseInt(page as string) || 1);
  const pageSize = Math.min(100, parseInt(limit as string) || 25);
  const offset   = (pageNum - 1) * pageSize;

  const conditions: any[] = [];
  const visWhere = buildVisibilityWhere(actor.id, actor.role);
  if (visWhere) conditions.push(visWhere);
  if (status)      conditions.push(eq(oiIssues.status, status as any));
  if (severity)    conditions.push(eq(oiIssues.severity, severity as any));
  if (category)    conditions.push(eq(oiIssues.category, category as any));
  if (projectPhase) conditions.push(eq(oiIssues.projectPhase, projectPhase as any));
  if (slaBreached === "response") conditions.push(eq(oiIssues.responseSlaBreached, true));
  if (slaBreached === "closure")  conditions.push(eq(oiIssues.closureSlaBreached, true));
  if (search) {
    const s = `%${search}%`;
    conditions.push(or(ilike(oiIssues.title, s), ilike(oiIssues.issueNumber, s)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [issues, totalRows] = await Promise.all([
    db.select().from(oiIssues).where(where).orderBy(desc(oiIssues.createdAt)).limit(pageSize).offset(offset),
    db.select({ n: count() }).from(oiIssues).where(where),
  ]);

  res.setHeader("X-Total-Count", String(totalRows[0]?.n ?? 0));
  return res.json(issues);
});

// ─── GET /api/oi/issues/:id ──────────────────────────────────────────────────
oiRouter.get("/issues/:id", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  const visWhere = buildVisibilityWhere(actor.id, actor.role);
  if (visWhere) {
    const isVisible = issue.reportedBy === actor.id || issue.assignedTo === actor.id;
    if (!isVisible && !hasRole(actor.role, MANAGER_ROLES)) {
      return res.status(403).json({ error: "forbidden" });
    }
  }

  const allowedTransitions = getAllowedTransitions(issue as any, actor.role);
  return res.json({ ...issue, allowedTransitions });
});

// ─── PATCH /api/oi/issues/:id ────────────────────────────────────────────────
oiRouter.patch("/issues/:id", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  // Only manager+ or own issue reporter can patch
  if (!hasRole(actor.role, MANAGER_ROLES) && issue.reportedBy !== actor.id) {
    return res.status(403).json({ error: "forbidden" });
  }

  const ALLOWED_MANAGER_FIELDS = [
    "title","description","subCategory","category","projectPhase","equipmentFamily","equipmentType",
    "packageType","processSystem","utilitySystem","skidSystem","customerIndustry","criticalEquipmentFlag",
    "criticalPathFlag","projectComplexity","assignedTo","technicalOwner","businessOwner",
    "probabilityLevel","impactLevel","recurrenceRisk","businessCriticality","customerCriticality",
    "safetyCriticality","statutoryCriticality","financialCriticality","operationalCriticality",
    "scheduleCriticality","occurredAt","detectedAt","repeatIssue","parentIssueId",
  ];
  const ALLOWED_SM_FIELDS = [
    ...ALLOWED_MANAGER_FIELDS,
    "riskOwner","escalationOwner","complianceOwner","financialOwner","legalOwner",
    "estimatedLossAmount","liabilitySeverity","consequentialDamageFlag","businessInterruptionFlag",
    "statutoryAuthority","complianceStatus","statutorySeverity","legalReviewRequired",
  ];

  const permitted = hasRole(actor.role, SM_ROLES) ? ALLOWED_SM_FIELDS : ALLOWED_MANAGER_FIELDS;
  const updates: Record<string, any> = {};

  for (const key of Object.keys(req.body)) {
    if (!permitted.includes(key)) continue;
    const oldVal = String((issue as any)[key] ?? "");
    const newVal = String(req.body[key] ?? "");
    if (oldVal === newVal) continue;
    updates[key] = req.body[key];
    await writeAuditLog({
      issueId: id, action: "field_updated",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      fieldName: key, oldValue: oldVal, newValue: newVal,
      ipAddress: actor.ip,
    });
  }

  if (Object.keys(updates).length === 0) return res.json(issue);

  // Recompute risk scores if relevant fields changed
  const needsRiskCompute = "probabilityLevel" in updates || "impactLevel" in updates;
  if (needsRiskCompute) {
    const { riskScore, riskRating } = await computeRiskScore(
      updates.probabilityLevel ?? issue.probabilityLevel,
      updates.impactLevel ?? issue.impactLevel
    );
    updates.riskScore  = riskScore;
    updates.riskRating = riskRating;
  }

  updates.updatedAt = new Date();
  const [updated] = await db.update(oiIssues).set(updates).where(eq(oiIssues.id, id)).returning();

  // Post-update escalation checks
  if (updates.safetyCriticality === "critical") {
    await triggerSafetyEscalation(updated as any, actor.id, actor.name, actor.role);
  }
  if (updates.statutoryCriticality === "high") {
    await triggerStatutoryEscalation(updated as any, actor.id, actor.name, actor.role);
  }
  if (updates.consequentialDamageFlag === true) {
    await triggerFinancialEscalation(updated as any, actor.id, actor.name, actor.role);
  }

  return res.json(updated);
});

// ─── POST /api/oi/issues/:id/transition ──────────────────────────────────────
oiRouter.post("/issues/:id/transition", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const parsed = transitionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed" });

  const { to, reason } = parsed.data;
  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  try {
    validateTransition(issue as any, to, actor.role, reason);
  } catch (e: any) {
    if (e instanceof TransitionError) {
      return res.status(e.httpStatus).json({ error: e.code, from: issue.status, to });
    }
    throw e;
  }

  const now = new Date();
  const updates: Record<string, any> = { status: to, updatedAt: now };

  if (to === "classified") {
    updates.classifiedBy = actor.id;
    updates.classifiedAt = now;
    const { responseDueAt, closureDueAt } = computeSla(issue.severity, now);
    updates.responseDueAt = responseDueAt;
    updates.closureDueAt  = closureDueAt;
  }
  if (to === "investigating") updates.investigatingStartedAt = now;
  if (to === "verified")  { updates.verifiedBy = actor.id; updates.verifiedAt = now; }
  if (to === "closed")    { updates.closedBy   = actor.id; updates.closedAt   = now; }
  if (to === "reopened")  { updates.reopenedBy = actor.id; updates.reopenedAt = now; updates.reopenReason = reason ?? null; }
  if (to === "withdrawn") { updates.withdrawnBy = actor.id; updates.withdrawnAt = now; updates.withdrawalReason = reason ?? null; }

  const [updated] = await db.update(oiIssues).set(updates).where(eq(oiIssues.id, id)).returning();

  await writeAuditLog({
    issueId: id, action: "status_changed",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    oldValue: issue.status, newValue: to,
    context: reason ?? undefined,
    ipAddress: actor.ip,
  });

  // Notifications for key transitions
  if (to === "classified" && updated.assignedTo) {
    await createNotification({
      userId: updated.assignedTo, type: "oi_classified",
      title: `Issue assigned: ${updated.issueNumber}`,
      message: `You have been assigned as investigator on ${updated.issueNumber}: ${updated.title}`,
      link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
    });
  }
  if (to === "verified") {
    await createNotification({
      userId: updated.reportedBy, type: "oi_verified",
      title: `Issue verified: ${updated.issueNumber}`,
      message: `Issue ${updated.issueNumber} has been verified and is pending closure.`,
      link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
    });
  }
  if (to === "closed") {
    for (const uid of [updated.reportedBy, updated.assignedTo].filter(Boolean)) {
      await createNotification({
        userId: uid!, type: "oi_closed",
        title: `Issue closed: ${updated.issueNumber}`,
        message: `Issue ${updated.issueNumber} has been closed.`,
        link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
      });
    }
  }
  if (to === "reopened") {
    if (updated.assignedTo) {
      await createNotification({
        userId: updated.assignedTo, type: "oi_reopened",
        title: `Issue reopened: ${updated.issueNumber}`,
        message: `Issue ${updated.issueNumber} has been reopened. Reason: ${reason}`,
        link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
      });
    }
  }

  return res.json(updated);
});

// ─── POST /api/oi/issues/:id/severity ────────────────────────────────────────
oiRouter.post("/issues/:id/severity", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const parsed = severityChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });
  if (issue.severity === parsed.data.severity) return res.json(issue);

  const now = new Date();
  const [updated] = await db.update(oiIssues).set({
    previousSeverity:    issue.severity,
    severity:            parsed.data.severity as any,
    severityChangedBy:   actor.id,
    severityChangedAt:   now,
    severityChangeReason: parsed.data.reason,
    updatedAt:           now,
  }).where(eq(oiIssues.id, id)).returning();

  await writeAuditLog({
    issueId: id, action: "severity_changed",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    oldValue: issue.severity, newValue: parsed.data.severity,
    context: parsed.data.reason, ipAddress: actor.ip,
  });

  return res.json(updated);
});

// ─── POST /api/oi/issues/:id/assign ──────────────────────────────────────────
oiRouter.post("/issues/:id/assign", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  const [updated] = await db.update(oiIssues)
    .set({ assignedTo: parsed.data.userId, updatedAt: new Date() })
    .where(eq(oiIssues.id, id)).returning();

  await writeAuditLog({
    issueId: id, action: "assigned",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    oldValue: String(issue.assignedTo ?? ""), newValue: String(parsed.data.userId),
    ipAddress: actor.ip,
  });

  await createNotification({
    userId: parsed.data.userId, type: "oi_assigned",
    title: `Issue assigned: ${issue.issueNumber}`,
    message: `You have been assigned as investigator on ${issue.issueNumber}: ${issue.title}`,
    link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
    createdBy: actor.id,
  });

  return res.json(updated);
});

// ─── POST /api/oi/issues/:id/withdraw ────────────────────────────────────────
oiRouter.post("/issues/:id/withdraw", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  if (!req.body.reason?.trim()) return res.status(422).json({ error: "withdrawal_reason_required" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });
  if (issue.status === "closed") return res.status(422).json({ error: "cannot_withdraw_closed_issue" });

  const now = new Date();
  const [updated] = await db.update(oiIssues).set({
    status: "withdrawn", withdrawnBy: actor.id, withdrawnAt: now,
    withdrawalReason: req.body.reason, updatedAt: now,
  }).where(eq(oiIssues.id, id)).returning();

  await writeAuditLog({
    issueId: id, action: "withdrawn",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: req.body.reason, ipAddress: actor.ip,
  });

  return res.json(updated);
});

// ─── POST /api/oi/issues/:id/reopen ──────────────────────────────────────────
oiRouter.post("/issues/:id/reopen", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  if (!req.body.reason?.trim()) return res.status(422).json({ error: "reopen_reason_required" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  return res.redirect(307, `/api/oi/issues/${id}/transition`);
});

// ─── GET /api/oi/issues/:id/audit ────────────────────────────────────────────
oiRouter.get("/issues/:id/audit", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const logs = await db.select().from(oiAuditLog)
    .where(eq(oiAuditLog.issueId, id))
    .orderBy(desc(oiAuditLog.createdAt));

  return res.json(logs);
});

// ─── GET /api/oi/issues/:id/escalations ──────────────────────────────────────
oiRouter.get("/issues/:id/escalations", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const escs = await db.select().from(oiEscalations)
    .where(eq(oiEscalations.issueId, id))
    .orderBy(desc(oiEscalations.triggeredAt));

  return res.json(escs);
});

// ─── POST /api/oi/issues/:id/escalate ────────────────────────────────────────
oiRouter.post("/issues/:id/escalate", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  await db.insert(oiEscalations).values({
    issueId: id, escalationType: "manual",
    triggeredBy: actor.id, context: req.body.context || "Manual escalation",
    notificationSent: false,
  });

  await writeAuditLog({
    issueId: id, action: "escalated",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    context: "Manual escalation triggered", ipAddress: actor.ip,
  });

  return res.json({ success: true });
});

// ─── Dashboard endpoints ──────────────────────────────────────────────────────
oiRouter.get("/dashboard/summary", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const visWhere = buildVisibilityWhere(actor.id, actor.role);

  const openWhere = visWhere
    ? and(visWhere, sql`status NOT IN ('closed','withdrawn')`)
    : sql`status NOT IN ('closed','withdrawn')`;

  const [allOpen, s1Open, s2Open, responseSla, closureSla, myIssues] = await Promise.all([
    db.select({ n: count() }).from(oiIssues).where(openWhere),
    db.select({ n: count() }).from(oiIssues).where(and(openWhere as any, eq(oiIssues.severity, "S1"))),
    db.select({ n: count() }).from(oiIssues).where(and(openWhere as any, eq(oiIssues.severity, "S2"))),
    db.select({ n: count() }).from(oiIssues).where(and(openWhere as any, eq(oiIssues.responseSlaBreached, true))),
    db.select({ n: count() }).from(oiIssues).where(and(openWhere as any, eq(oiIssues.closureSlaBreached, true))),
    db.select({ n: count() }).from(oiIssues).where(
      and(openWhere as any, or(eq(oiIssues.reportedBy, actor.id), eq(oiIssues.assignedTo, actor.id)))
    ),
  ]);

  return res.json({
    totalOpen:         allOpen[0]?.n ?? 0,
    criticalOpen:      s1Open[0]?.n ?? 0,
    majorOpen:         s2Open[0]?.n ?? 0,
    slaBreaches:       (responseSla[0]?.n ?? 0) + (closureSla[0]?.n ?? 0),
    myOpenIssues:      myIssues[0]?.n ?? 0,
  });
});

oiRouter.get("/dashboard/by-status", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const visWhere = buildVisibilityWhere(actor.id, actor.role);

  const rows = await db.select({ status: oiIssues.status, n: count() })
    .from(oiIssues)
    .where(visWhere)
    .groupBy(oiIssues.status);

  return res.json(rows);
});

oiRouter.get("/dashboard/risk-heatmap", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.select({
    riskRating: oiIssues.riskRating,
    severity:   oiIssues.severity,
    n:          count(),
  }).from(oiIssues)
    .where(sql`status NOT IN ('closed','withdrawn')`)
    .groupBy(oiIssues.riskRating, oiIssues.severity);

  return res.json(rows);
});

oiRouter.get("/dashboard/sla-breaches", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const [resp, clos] = await Promise.all([
    db.select({ n: count() }).from(oiIssues).where(eq(oiIssues.responseSlaBreached, true)),
    db.select({ n: count() }).from(oiIssues).where(eq(oiIssues.closureSlaBreached, true)),
  ]);

  return res.json({ responseBreaches: resp[0]?.n ?? 0, closureBreaches: clos[0]?.n ?? 0 });
});

oiRouter.get("/dashboard/escalations", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.select({ type: oiEscalations.escalationType, n: count() })
    .from(oiEscalations)
    .where(eq(oiEscalations.resolved, false))
    .groupBy(oiEscalations.escalationType);

  return res.json(rows);
});

// ─── Config endpoints (Superuser only) ───────────────────────────────────────
oiRouter.get("/config/risk-weights", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const [cfg] = await db.select().from(oiRiskWeightConfig).limit(1);
  return res.json(cfg ?? null);
});

oiRouter.put("/config/risk-weights", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" });
  const [existing] = await db.select().from(oiRiskWeightConfig).limit(1);
  if (existing) {
    const [updated] = await db.update(oiRiskWeightConfig)
      .set({ ...req.body, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(oiRiskWeightConfig.id, existing.id)).returning();
    return res.json(updated);
  }
  const [created] = await db.insert(oiRiskWeightConfig)
    .values({ ...req.body, updatedBy: actor.id }).returning();
  return res.json(created);
});

oiRouter.get("/config/risk-matrix", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const rows = await db.select().from(oiRiskMatrixConfig).orderBy(asc(oiRiskMatrixConfig.probability), asc(oiRiskMatrixConfig.impact));
  return res.json(rows);
});

oiRouter.put("/config/risk-matrix", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" });
  const { probability, impact, riskRating } = req.body;
  if (!probability || !impact || !riskRating) return res.status(400).json({ error: "missing_fields" });
  const existing = await db.select().from(oiRiskMatrixConfig)
    .where(and(eq(oiRiskMatrixConfig.probability, probability), eq(oiRiskMatrixConfig.impact, impact)));
  if (existing[0]) {
    const [updated] = await db.update(oiRiskMatrixConfig)
      .set({ riskRating, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(oiRiskMatrixConfig.id, existing[0].id)).returning();
    return res.json(updated);
  }
  const [created] = await db.insert(oiRiskMatrixConfig)
    .values({ probability, impact, riskRating, updatedBy: actor.id }).returning();
  return res.json(created);
});
