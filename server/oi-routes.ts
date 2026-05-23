import { Router } from "express";
import { db } from "./db";
import {
  oiIssues, oiAuditLog, oiEscalations, oiRiskWeightConfig, oiRiskMatrixConfig,
  insertOiIssueSchema, OiIssue, users,
  customers, vendors, contracts,
  epcDrawingControls, epcPurchaseOrders, epcWorkOrders, inspectionOrders,
  projects,
} from "@shared/schema";
import {
  eq, and, or, desc, asc, ilike, count, lt, isNotNull, isNull, inArray, sql, avg, gte, lte,
} from "drizzle-orm";
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
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];
const GM_ROLES      = ["General Manager", "Superuser"];

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

// ─── Issue number generation ──────────────────────────────────────────────────
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

// ─── Risk score computation (P×I matrix) ─────────────────────────────────────
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

// ─── OI Risk Score computation (Phase 1B — from stored dimension columns) ────
const DIMENSION_SCORE_KEYS = [
  "technicalScore", "qualityScore", "safetyScore", "financialScore",
  "complianceScore", "scheduleScore", "liabilityScore", "customerScore", "operationalScore",
] as const;

async function computeOiRiskScore(
  currentIssue: Record<string, any>,
  updates: Record<string, any>
): Promise<number | null> {
  const allNull = DIMENSION_SCORE_KEYS.every(
    k => (updates[k] ?? currentIssue[k]) == null
  );
  if (allNull) return null;

  const [cfg] = await db.select().from(oiRiskWeightConfig).limit(1);
  if (!cfg) return null;

  const get = (k: string) => Number(updates[k] ?? currentIssue[k] ?? 0);
  const sum =
    get("technicalScore")   * Number(cfg.technicalWeight)   +
    get("qualityScore")     * Number(cfg.qualityWeight)     +
    get("safetyScore")      * Number(cfg.safetyWeight)      +
    get("financialScore")   * Number(cfg.financialWeight)   +
    get("complianceScore")  * Number(cfg.complianceWeight)  +
    get("scheduleScore")    * Number(cfg.scheduleWeight)    +
    get("liabilityScore")   * Number(cfg.liabilityWeight)   +
    get("customerScore")    * Number(cfg.customerWeight)    +
    get("operationalScore") * Number(cfg.operationalWeight);

  return Math.round(sum);
}

// ─── net_financial_exposure computation ──────────────────────────────────────
function computeNetExposure(
  actualLoss: string | null | undefined,
  recovery: string | null | undefined
): string | null {
  if (actualLoss == null) return null;
  const loss = parseFloat(actualLoss) || 0;
  const rec  = parseFloat(recovery ?? "0") || 0;
  const net  = loss - rec;
  return Math.max(0, net).toFixed(2);
}

// ─── Time intelligence helpers ────────────────────────────────────────────────
function hoursElapsed(from: Date | null | undefined, to: Date): string | null {
  if (!from) return null;
  const ms = to.getTime() - new Date(from).getTime();
  if (ms <= 0) return null;
  return (ms / 3_600_000).toFixed(2);
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
  if (role === "Senior Manager" || role === "Manager") return undefined;
  return or(eq(oiIssues.reportedBy, userId), eq(oiIssues.assignedTo, userId));
}

// ─── Allowed field sets ───────────────────────────────────────────────────────
const ALLOWED_MANAGER_FIELDS = [
  "title","description","subCategory","category","projectPhase","equipmentFamily","equipmentType",
  "packageType","processSystem","utilitySystem","skidSystem","customerIndustry","criticalEquipmentFlag",
  "criticalPathFlag","projectComplexity","assignedTo","technicalOwner","businessOwner",
  "probabilityLevel","impactLevel","recurrenceRisk","businessCriticality","customerCriticality",
  "safetyCriticality","statutoryCriticality","financialCriticality","operationalCriticality",
  "scheduleCriticality","occurredAt","detectedAt","repeatIssue","parentIssueId",
  // Phase 1B linkage fields
  "customerId","vendorId","epcDrawingControlId","epcPoId","epcWoId",
  "inspectionOrderId","fatInspectionOrderId","satInspectionOrderId","contractId",
  "fatReference","satReference",
  // Phase 1B dimension scores
  "technicalScore","qualityScore","safetyScore","financialScore","complianceScore",
  "scheduleScore","liabilityScore","customerScore","operationalScore",
];

const ALLOWED_SM_FIELDS = [
  ...ALLOWED_MANAGER_FIELDS,
  "riskOwner","escalationOwner","complianceOwner","financialOwner","legalOwner",
  "estimatedLossAmount","liabilitySeverity","consequentialDamageFlag","businessInterruptionFlag",
  "statutoryAuthority","complianceStatus","statutorySeverity","legalReviewRequired",
  // Phase 1B financial exposure
  "actualLossAmount","insuranceClaimFlag","claimReference","recoveryAmount",
  // Phase 1B liability
  "liabilityType","indemnityRequired","warrantyClaimFlag","warrantyClaimReference",
  // Phase 1C: RCA control fields — SM+ only
  "rcaRequired","rcaDueDate",
];

// COMPUTED-ONLY — never accepted from client in any field set
const COMPUTED_FIELDS = new Set([
  "netFinancialExposure","captureDelayHours","responseTimeActualHours",
  "investigationDurationHours","totalResolutionHours","oiRiskScore",
  "riskScore","riskRating",
]);

// ─── Validation schemas ───────────────────────────────────────────────────────
const createIssueBodySchema = z.object({
  title:         z.string().min(1).max(500),
  description:   z.string().min(1),
  department:    z.string().min(1),
  category:      z.enum(["QC","DWG","PROC","MFG","SITE","COMM","LOG","DOC","SAP","COMP","SAFETY","FIN","LEGAL","HR","CUST","SYS","INT","OTHER","PROJECT","MAINT","STORE","SALES","QA"]),
  projectPhase:  z.enum(["SALES","ENG","DVS","PROC","MFG","QC","FAT","DISP","LOG","SITE","ERECT","SAT","COMM","PERF","WARR","AFTS"]),
  severity:      z.enum(["S1","S2","S3","S4"]),
  projectId:     z.number().int().positive().optional().nullable(),
  customerId:    z.number().int().positive().optional().nullable(),
  vendorId:      z.number().int().positive().optional().nullable(),
  subCategory:   z.string().max(200).optional().nullable(),
  occurredAt:    z.string().datetime().optional().nullable(),
  detectedAt:    z.string().datetime().optional().nullable(),
  equipmentFamily:       z.string().optional().nullable(),
  equipmentType:         z.string().optional().nullable(),
  packageType:           z.string().optional().nullable(),
  processSystem:         z.string().optional().nullable(),
  utilitySystem:         z.string().optional().nullable(),
  skidSystem:            z.string().optional().nullable(),
  customerIndustry:      z.string().optional().nullable(),
  criticalEquipmentFlag: z.boolean().optional(),
  criticalPathFlag:      z.boolean().optional(),
  projectComplexity:     z.string().optional().nullable(),
}).strict();

// Phase 1B PATCH Zod schema for Manager+ linkage and score fields
const managerPatchExtSchema = z.object({
  customerId:           z.number().int().positive().nullable().optional(),
  vendorId:             z.number().int().positive().nullable().optional(),
  epcDrawingControlId:  z.number().int().positive().nullable().optional(),
  epcPoId:              z.number().int().positive().nullable().optional(),
  epcWoId:              z.number().int().positive().nullable().optional(),
  inspectionOrderId:    z.number().int().positive().nullable().optional(),
  fatInspectionOrderId: z.number().int().positive().nullable().optional(),
  satInspectionOrderId: z.number().int().positive().nullable().optional(),
  contractId:           z.number().int().positive().nullable().optional(),
  technicalScore:    z.number().int().min(0).max(10).nullable().optional(),
  qualityScore:      z.number().int().min(0).max(10).nullable().optional(),
  safetyScore:       z.number().int().min(0).max(10).nullable().optional(),
  financialScore:    z.number().int().min(0).max(10).nullable().optional(),
  complianceScore:   z.number().int().min(0).max(10).nullable().optional(),
  scheduleScore:     z.number().int().min(0).max(10).nullable().optional(),
  liabilityScore:    z.number().int().min(0).max(10).nullable().optional(),
  customerScore:     z.number().int().min(0).max(10).nullable().optional(),
  operationalScore:  z.number().int().min(0).max(10).nullable().optional(),
});

// Phase 1B PATCH Zod schema for SM+ financial/liability fields
const smPatchExtSchema = z.object({
  actualLossAmount:       z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  insuranceClaimFlag:     z.boolean().optional(),
  claimReference:         z.string().max(200).nullable().optional(),
  recoveryAmount:         z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  liabilityType:          z.enum(["warranty","indemnity","third_party","regulatory","internal","none"]).nullable().optional(),
  indemnityRequired:      z.boolean().optional(),
  warrantyClaimFlag:      z.boolean().optional(),
  warrantyClaimReference: z.string().max(200).nullable().optional(),
});

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

// ─── FK validation helper ─────────────────────────────────────────────────────
async function validateLinkageFKs(body: Record<string, any>): Promise<string | null> {
  const checks: Array<{ field: string; table: any; id: number }> = [];
  if (body.customerId != null)          checks.push({ field: "customerId",          table: customers,          id: body.customerId });
  if (body.vendorId != null)            checks.push({ field: "vendorId",            table: vendors,            id: body.vendorId });
  if (body.epcDrawingControlId != null) checks.push({ field: "epcDrawingControlId", table: epcDrawingControls, id: body.epcDrawingControlId });
  if (body.epcPoId != null)             checks.push({ field: "epcPoId",             table: epcPurchaseOrders,  id: body.epcPoId });
  if (body.epcWoId != null)             checks.push({ field: "epcWoId",             table: epcWorkOrders,      id: body.epcWoId });
  if (body.inspectionOrderId != null)   checks.push({ field: "inspectionOrderId",   table: inspectionOrders,   id: body.inspectionOrderId });
  if (body.fatInspectionOrderId != null) checks.push({ field: "fatInspectionOrderId", table: inspectionOrders, id: body.fatInspectionOrderId });
  if (body.satInspectionOrderId != null) checks.push({ field: "satInspectionOrderId", table: inspectionOrders, id: body.satInspectionOrderId });
  if (body.contractId != null)          checks.push({ field: "contractId",          table: contracts,          id: body.contractId });

  for (const chk of checks) {
    const [row] = await db.select({ id: chk.table.id }).from(chk.table).where(eq(chk.table.id, chk.id)).limit(1);
    if (!row) return chk.field;
  }
  return null;
}

// ─── POST /api/oi/issues ──────────────────────────────────────────────────────
oiRouter.post("/issues", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const parsed = createIssueBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });

  const body = parsed.data;
  const issueNumber = await generateIssueNumber();
  const now = new Date();

  // customer_id auto-population: from project if not explicitly supplied
  let resolvedCustomerId: number | null = body.customerId ?? null;
  if (body.projectId && resolvedCustomerId == null) {
    const [proj] = await db.select({ customerId: projects.customerId })
      .from(projects).where(eq(projects.id, body.projectId)).limit(1);
    if (proj?.customerId) resolvedCustomerId = proj.customerId;
  }

  // capture_delay_hours: time from detection to reporting
  let captureDelayHours: string | null = null;
  if (body.detectedAt) {
    captureDelayHours = hoursElapsed(new Date(body.detectedAt), now);
  }

  const [issue] = await db.insert(oiIssues).values({
    issueNumber,
    title:        body.title,
    description:  body.description,
    department:   body.department,
    category:     body.category as any,
    subCategory:  body.subCategory ?? null,
    projectPhase: body.projectPhase as any,
    severity:     body.severity as any,
    status:       "captured",
    projectId:    body.projectId ?? null,
    customerId:   resolvedCustomerId,
    vendorId:     body.vendorId ?? null,
    occurredAt:   body.occurredAt ? new Date(body.occurredAt) : null,
    detectedAt:   body.detectedAt ? new Date(body.detectedAt) : null,
    captureDelayHours,
    equipmentFamily:       body.equipmentFamily ?? null,
    equipmentType:         body.equipmentType ?? null,
    packageType:           body.packageType ?? null,
    processSystem:         body.processSystem ?? null,
    utilitySystem:         body.utilitySystem ?? null,
    skidSystem:            body.skidSystem ?? null,
    customerIndustry:      body.customerIndustry ?? null,
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

  if (issue.severity === "S1") {
    await triggerS1ImmediateEscalation(issue as any, actor.id);
  }

  return res.status(201).json(issue);
});

// ─── GET /api/oi/issues ───────────────────────────────────────────────────────
oiRouter.get("/issues", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const {
    status, severity, category, projectPhase, search,
    slaBreached, page = "1", limit = "25",
    // Phase 1B filters
    customerId, vendorId, contractId, epcPoId, epcWoId,
    inspectionOrderId, epcDrawingControlId, hasFinancialExposure,
    dateFrom, dateTo,
    // Phase 1C filters
    rcaRequired, rcaOverdue, rcaStatus, rootCauseCode,
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page as string) || 1);
  const pageSize = Math.min(100, parseInt(limit as string) || 25);
  const offset   = (pageNum - 1) * pageSize;

  const conditions: any[] = [];
  const visWhere = buildVisibilityWhere(actor.id, actor.role);
  if (visWhere) conditions.push(visWhere);
  if (status)       conditions.push(eq(oiIssues.status, status as any));
  if (severity)     conditions.push(eq(oiIssues.severity, severity as any));
  if (category)     conditions.push(eq(oiIssues.category, category as any));
  if (projectPhase) conditions.push(eq(oiIssues.projectPhase, projectPhase as any));
  if (slaBreached === "response") conditions.push(eq(oiIssues.responseSlaBreached, true));
  if (slaBreached === "closure")  conditions.push(eq(oiIssues.closureSlaBreached, true));
  if (slaBreached === "any") conditions.push(
    or(eq(oiIssues.responseSlaBreached, true), eq(oiIssues.closureSlaBreached, true))
  );
  if (search) {
    const s = `%${search}%`;
    conditions.push(or(ilike(oiIssues.title, s), ilike(oiIssues.issueNumber, s)));
  }
  // Phase 1B filters
  const cidParsed = parseInt(customerId as string);
  if (!isNaN(cidParsed)) conditions.push(eq(oiIssues.customerId, cidParsed));
  const vidParsed = parseInt(vendorId as string);
  if (!isNaN(vidParsed)) conditions.push(eq(oiIssues.vendorId, vidParsed));
  const conParsed = parseInt(contractId as string);
  if (!isNaN(conParsed)) conditions.push(eq(oiIssues.contractId, conParsed));
  const poParsed = parseInt(epcPoId as string);
  if (!isNaN(poParsed)) conditions.push(eq(oiIssues.epcPoId, poParsed));
  const woParsed = parseInt(epcWoId as string);
  if (!isNaN(woParsed)) conditions.push(eq(oiIssues.epcWoId, woParsed));
  const ioParsed = parseInt(inspectionOrderId as string);
  if (!isNaN(ioParsed)) conditions.push(eq(oiIssues.inspectionOrderId, ioParsed));
  const dwgParsed = parseInt(epcDrawingControlId as string);
  if (!isNaN(dwgParsed)) conditions.push(eq(oiIssues.epcDrawingControlId, dwgParsed));
  if (hasFinancialExposure === "true")  conditions.push(isNotNull(oiIssues.actualLossAmount));
  if (hasFinancialExposure === "false") conditions.push(isNull(oiIssues.actualLossAmount));
  if (dateFrom) conditions.push(gte(oiIssues.createdAt, new Date(dateFrom as string)));
  if (dateTo)   conditions.push(lte(oiIssues.createdAt, new Date(dateTo as string)));

  // Phase 1C filters
  if (rcaRequired === "true")  conditions.push(eq(oiIssues.rcaRequired, true));
  if (rcaOverdue  === "true")  conditions.push(
    and(
      eq(oiIssues.rcaRequired, true),
      isNotNull(oiIssues.rcaDueDate),
      lt(oiIssues.rcaDueDate, new Date())
    )
  );

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let issues = await db.select().from(oiIssues).where(where).orderBy(desc(oiIssues.createdAt)).limit(pageSize * 3).offset(offset);
  const totalBeforeRcaFilter = await db.select({ n: count() }).from(oiIssues).where(where);

  // Phase 1C: rcaStatus and rootCauseCode require a join — filter in memory
  if (rcaStatus || rootCauseCode) {
    const { oiRcaRecords: rcaTable } = await import("@shared/schema");
    const issueIds = issues.map(i => i.id);
    if (issueIds.length > 0) {
      const rcaRows = await db.select({ issueId: rcaTable.issueId, status: rcaTable.status, rootCauseCode: rcaTable.rootCauseCode }).from(rcaTable).where(inArray(rcaTable.issueId, issueIds));
      const rcaMap = new Map(rcaRows.map(r => [r.issueId, r]));
      issues = issues.filter(i => {
        const rca = rcaMap.get(i.id);
        if (rcaStatus === "none") { return i.rcaRequired && !rca; }
        if (rcaStatus && rcaStatus !== "none") { return rca?.status === rcaStatus; }
        if (rootCauseCode) { return rca?.rootCauseCode === rootCauseCode; }
        return true;
      });
    }
  }

  res.setHeader("X-Total-Count", String(totalBeforeRcaFilter[0]?.n ?? 0));
  return res.json(issues.slice(0, pageSize));
});

// ─── GET /api/oi/issues/:id ───────────────────────────────────────────────────
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

  // Fetch denormalised display fields via parallel lookups
  const [
    customerRow, vendorRow, drawingRow, poRow, woRow,
    ioRow, fatIoRow, satIoRow, contractRow, projectRow,
  ] = await Promise.all([
    issue.customerId
      ? db.select({ name: customers.bpName, bpCode: customers.bpCode }).from(customers).where(eq(customers.id, issue.customerId!)).limit(1)
      : Promise.resolve([]),
    issue.vendorId
      ? db.select({ name: vendors.name, displayName: vendors.displayName, sapCode: vendors.sapCardCode }).from(vendors).where(eq(vendors.id, issue.vendorId!)).limit(1)
      : Promise.resolve([]),
    issue.epcDrawingControlId
      ? db.select({ drawingNumber: epcDrawingControls.drawingNumber, drawingTitle: epcDrawingControls.drawingTitle, drawingRevision: epcDrawingControls.drawingRevision, dwgControlNumber: epcDrawingControls.dwgControlNumber }).from(epcDrawingControls).where(eq(epcDrawingControls.id, issue.epcDrawingControlId!)).limit(1)
      : Promise.resolve([]),
    issue.epcPoId
      ? db.select({ poNumber: epcPurchaseOrders.poNumber }).from(epcPurchaseOrders).where(eq(epcPurchaseOrders.id, issue.epcPoId!)).limit(1)
      : Promise.resolve([]),
    issue.epcWoId
      ? db.select({ woNumber: epcWorkOrders.woNumber }).from(epcWorkOrders).where(eq(epcWorkOrders.id, issue.epcWoId!)).limit(1)
      : Promise.resolve([]),
    issue.inspectionOrderId
      ? db.select({ num: inspectionOrders.inspectionOrderNumber }).from(inspectionOrders).where(eq(inspectionOrders.id, issue.inspectionOrderId!)).limit(1)
      : Promise.resolve([]),
    issue.fatInspectionOrderId
      ? db.select({ num: inspectionOrders.inspectionOrderNumber }).from(inspectionOrders).where(eq(inspectionOrders.id, issue.fatInspectionOrderId!)).limit(1)
      : Promise.resolve([]),
    issue.satInspectionOrderId
      ? db.select({ num: inspectionOrders.inspectionOrderNumber }).from(inspectionOrders).where(eq(inspectionOrders.id, issue.satInspectionOrderId!)).limit(1)
      : Promise.resolve([]),
    issue.contractId
      ? db.select({ contractNumber: contracts.contractNumber, title: contracts.title, contractType: contracts.contractType, contractValue: contracts.contractValue }).from(contracts).where(eq(contracts.id, issue.contractId!)).limit(1)
      : Promise.resolve([]),
    issue.projectId
      ? db.select({ code: projects.code, name: projects.name }).from(projects).where(eq(projects.id, issue.projectId!)).limit(1)
      : Promise.resolve([]),
  ]);

  const allowedTransitions = getAllowedTransitions(issue as any, actor.role);

  const cust    = (customerRow as any[])[0];
  const vend    = (vendorRow as any[])[0];
  const dwg     = (drawingRow as any[])[0];
  const po      = (poRow as any[])[0];
  const wo      = (woRow as any[])[0];
  const io      = (ioRow as any[])[0];
  const fatIo   = (fatIoRow as any[])[0];
  const satIo   = (satIoRow as any[])[0];
  const ctr     = (contractRow as any[])[0];
  const proj    = (projectRow as any[])[0];

  // Phase 1C: rcaSummary via LEFT JOIN lookup
  let rcaSummary: any = null;
  if (hasRole(actor.role, ["Manager","Senior Manager","General Manager","Superuser"])) {
    const { oiRcaRecords: rcaT, oiRcaFiveWhy: fwT, oiRcaFishbone: fbT, oiRcaFailureTreeNodes: ftT, oiRcaEvidence: evT } = await import("@shared/schema");
    const { count: cnt } = await import("drizzle-orm");
    const [rca] = await db.select().from(rcaT).where(eq(rcaT.issueId, id));
    if (rca) {
      const [fwC, fbC, ftC, evC] = await Promise.all([
        db.select({ n: cnt() }).from(fwT).where(eq(fwT.rcaId, rca.id)),
        db.select({ n: cnt() }).from(fbT).where(eq(fbT.rcaId, rca.id)),
        db.select({ n: cnt() }).from(ftT).where(eq(ftT.rcaId, rca.id)),
        db.select({ n: cnt() }).from(evT).where(eq(evT.rcaId, rca.id)),
      ]);
      const rcaLabels: Record<string, string> = { DESIGN_ERROR:'Design Error', MANUFACTURING_DEFECT:'Manufacturing Defect', MATERIAL_FAILURE:'Material Failure', PROCESS_DEVIATION:'Process Deviation', HUMAN_ERROR:'Human Error', EQUIPMENT_FAILURE:'Equipment Failure', SUPPLIER_QUALITY:'Supplier Quality', SPECIFICATION_GAP:'Specification Gap', COMMUNICATION_FAILURE:'Communication Failure', ENVIRONMENTAL_FACTOR:'Environmental Factor', SYSTEMIC_WEAKNESS:'Systemic Weakness', INSPECTION_FAILURE:'Inspection Failure', MAINTENANCE_FAILURE:'Maintenance Failure', SOFTWARE_ERROR:'Software / Configuration Error', UNKNOWN:'Unknown' };
      const assignedUsr = rca.assignedTo ? await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, rca.assignedTo)).limit(1) : [];
      rcaSummary = {
        id: rca.id, status: rca.status, methodology: rca.methodology,
        rootCauseCode: rca.rootCauseCode, rootCauseLabel: rcaLabels[rca.rootCauseCode] ?? rca.rootCauseCode,
        revisionNumber: rca.revisionNumber, approvedAt: rca.approvedAt,
        assignedToName: assignedUsr[0] ? (assignedUsr[0].name || assignedUsr[0].username) : null,
        fiveWhyCount: Number(fwC[0]?.n ?? 0), fishboneCount: Number(fbC[0]?.n ?? 0),
        failureTreeCount: Number(ftC[0]?.n ?? 0), evidenceCount: Number(evC[0]?.n ?? 0),
      };
    }
  }

  return res.json({
    ...issue,
    allowedTransitions,
    rcaSummary,
    // Customer
    customerName:    cust?.name ?? null,
    customerBpCode:  cust?.bpCode ?? null,
    // Vendor
    vendorName:    vend?.displayName ?? vend?.name ?? null,
    vendorSapCode: vend?.sapCode ?? null,
    // Drawing
    drawingNumber:    dwg?.drawingNumber    ?? null,
    drawingTitle:     dwg?.drawingTitle     ?? null,
    drawingRevision:  dwg?.drawingRevision  ?? null,
    dwgControlNumber: dwg?.dwgControlNumber ?? null,
    // PO / WO / IO
    poNumber:               po?.poNumber   ?? null,
    woNumber:               wo?.woNumber   ?? null,
    inspectionOrderNumber:  io?.num        ?? null,
    fatInspectionOrderNumber: fatIo?.num   ?? null,
    satInspectionOrderNumber: satIo?.num   ?? null,
    // Contract
    contractNumber: ctr?.contractNumber ?? null,
    contractTitle:  ctr?.title          ?? null,
    contractType:   ctr?.contractType   ?? null,
    contractValue:  ctr?.contractValue  ?? null,
    // Project
    projectCode:        proj?.code ?? null,
    projectDisplayName: proj ? `${proj.code} — ${proj.name}` : null,
  });
});

// ─── PATCH /api/oi/issues/:id ─────────────────────────────────────────────────
oiRouter.patch("/issues/:id", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const [issue] = await db.select().from(oiIssues).where(eq(oiIssues.id, id));
  if (!issue) return res.status(404).json({ error: "not_found" });

  if (!hasRole(actor.role, MANAGER_ROLES) && issue.reportedBy !== actor.id) {
    return res.status(403).json({ error: "forbidden" });
  }

  // Validate Phase 1B field sets for correct role
  const managerOnlyP1bFields = [
    "customerId","vendorId","epcDrawingControlId","epcPoId","epcWoId",
    "inspectionOrderId","fatInspectionOrderId","satInspectionOrderId","contractId",
    "technicalScore","qualityScore","safetyScore","financialScore","complianceScore",
    "scheduleScore","liabilityScore","customerScore","operationalScore","fatReference","satReference",
  ];
  const smOnlyP1bFields = [
    "actualLossAmount","insuranceClaimFlag","claimReference","recoveryAmount",
    "liabilityType","indemnityRequired","warrantyClaimFlag","warrantyClaimReference",
  ];

  const bodyKeys = Object.keys(req.body);
  const hasManagerP1bFields = bodyKeys.some(k => managerOnlyP1bFields.includes(k));
  const hasSmP1bFields      = bodyKeys.some(k => smOnlyP1bFields.includes(k));

  if (hasManagerP1bFields && !hasRole(actor.role, MANAGER_ROLES)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (hasSmP1bFields && !hasRole(actor.role, SM_ROLES)) {
    return res.status(403).json({ error: "forbidden" });
  }

  // Validate dimension scores via Zod
  if (hasManagerP1bFields) {
    const scoreResult = managerPatchExtSchema.safeParse(req.body);
    if (!scoreResult.success) {
      return res.status(400).json({ error: "validation_failed", details: scoreResult.error.flatten() });
    }
  }

  // Validate financial/liability fields via Zod
  if (hasSmP1bFields) {
    const finResult = smPatchExtSchema.safeParse(req.body);
    if (!finResult.success) {
      return res.status(400).json({ error: "validation_failed", details: finResult.error.flatten() });
    }
  }

  // FK existence validation for all linkage fields
  const badField = await validateLinkageFKs(req.body);
  if (badField) {
    return res.status(422).json({ error: "linked_record_not_found", field: badField });
  }

  const permitted = hasRole(actor.role, SM_ROLES) ? ALLOWED_SM_FIELDS : ALLOWED_MANAGER_FIELDS;
  const updates: Record<string, any> = {};

  for (const key of bodyKeys) {
    if (COMPUTED_FIELDS.has(key)) continue; // silently block computed fields
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

  // Recompute P×I risk score if relevant fields changed
  const needsRiskCompute = "probabilityLevel" in updates || "impactLevel" in updates;
  if (needsRiskCompute) {
    const { riskScore, riskRating } = await computeRiskScore(
      updates.probabilityLevel ?? issue.probabilityLevel,
      updates.impactLevel ?? issue.impactLevel
    );
    updates.riskScore  = riskScore;
    updates.riskRating = riskRating;
  }

  // Recompute OI Risk Score from stored dimension scores
  const needsOiScore = DIMENSION_SCORE_KEYS.some(k => k in updates);
  if (needsOiScore) {
    const newScore = await computeOiRiskScore(issue as any, updates);
    const oldScore = String(issue.oiRiskScore ?? "");
    if (String(newScore ?? "") !== oldScore) {
      updates.oiRiskScore = newScore;
      await writeAuditLog({
        issueId: id, action: "field_updated",
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        fieldName: "oiRiskScore", oldValue: oldScore, newValue: String(newScore ?? ""),
        ipAddress: actor.ip,
      });
    }
  }

  // Recompute net_financial_exposure
  const needsExposure = "actualLossAmount" in updates || "recoveryAmount" in updates;
  if (needsExposure) {
    const newExposure = computeNetExposure(
      updates.actualLossAmount  ?? issue.actualLossAmount,
      updates.recoveryAmount    ?? issue.recoveryAmount
    );
    const oldExposure = String(issue.netFinancialExposure ?? "");
    if (String(newExposure ?? "") !== oldExposure) {
      updates.netFinancialExposure = newExposure;
      await writeAuditLog({
        issueId: id, action: "field_updated",
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        fieldName: "netFinancialExposure", oldValue: oldExposure, newValue: String(newExposure ?? ""),
        ipAddress: actor.ip,
      });
    }
  }

  updates.updatedAt = new Date();
  const [updated] = await db.update(oiIssues).set(updates).where(eq(oiIssues.id, id)).returning();

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
    await validateTransition(issue as any, to, actor.role, reason);
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
  if (to === "investigating") {
    updates.investigatingStartedAt = now;
    // Phase 1B: response_time_actual_hours
    const rta = hoursElapsed(issue.classifiedAt, now);
    if (rta !== null) {
      updates.responseTimeActualHours = rta;
      await writeAuditLog({
        issueId: id, action: "field_updated",
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        fieldName: "responseTimeActualHours", oldValue: "", newValue: rta,
        ipAddress: actor.ip,
      });
    }
  }
  if (to === "verified") {
    updates.verifiedBy = actor.id;
    updates.verifiedAt = now;
    // Phase 1B: investigation_duration_hours
    const inv = hoursElapsed(issue.investigatingStartedAt, now);
    if (inv !== null) {
      updates.investigationDurationHours = inv;
      await writeAuditLog({
        issueId: id, action: "field_updated",
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        fieldName: "investigationDurationHours", oldValue: "", newValue: inv,
        ipAddress: actor.ip,
      });
    }
  }
  if (to === "closed") {
    updates.closedBy = actor.id;
    updates.closedAt = now;
    // Phase 1B: total_resolution_hours
    const res_ = hoursElapsed(issue.classifiedAt, now);
    if (res_ !== null) {
      updates.totalResolutionHours = res_;
      await writeAuditLog({
        issueId: id, action: "field_updated",
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        fieldName: "totalResolutionHours", oldValue: "", newValue: res_,
        ipAddress: actor.ip,
      });
    }
  }
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
  if (to === "reopened" && updated.assignedTo) {
    await createNotification({
      userId: updated.assignedTo, type: "oi_reopened",
      title: `Issue reopened: ${updated.issueNumber}`,
      message: `Issue ${updated.issueNumber} has been reopened. Reason: ${reason}`,
      link: `/oi/issues/${id}`, category: "operational_intelligence", sourceType: "oi_issue", sourceId: id,
    });
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

// ─── Lookup endpoints (Manager+ — project-scoped dropdowns for linkage UI) ───

oiRouter.get("/lookup/drawings", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const projectId = parseInt(req.query.projectId as string);
  const q = req.query.q as string | undefined;

  const conditions: any[] = [];
  if (!isNaN(projectId)) conditions.push(eq(epcDrawingControls.projectId, projectId));
  if (q) {
    const s = `%${q}%`;
    conditions.push(or(
      ilike(epcDrawingControls.drawingNumber, s),
      ilike(epcDrawingControls.drawingTitle, s),
      ilike(epcDrawingControls.dwgControlNumber, s)
    ));
  }

  const rows = await db.select({
    id: epcDrawingControls.id,
    drawingNumber:    epcDrawingControls.drawingNumber,
    drawingTitle:     epcDrawingControls.drawingTitle,
    drawingRevision:  epcDrawingControls.drawingRevision,
    dwgControlNumber: epcDrawingControls.dwgControlNumber,
  }).from(epcDrawingControls)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(epcDrawingControls.drawingNumber))
    .limit(50);

  return res.json(rows);
});

oiRouter.get("/lookup/epc-pos", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const projectId = parseInt(req.query.projectId as string);
  const q = req.query.q as string | undefined;

  const conditions: any[] = [];
  if (!isNaN(projectId)) conditions.push(eq(epcPurchaseOrders.projectId, projectId));
  if (q) conditions.push(ilike(epcPurchaseOrders.poNumber, `%${q}%`));

  const rows = await db.select({
    id: epcPurchaseOrders.id,
    poNumber: epcPurchaseOrders.poNumber,
  }).from(epcPurchaseOrders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(epcPurchaseOrders.poNumber))
    .limit(50);

  return res.json(rows);
});

oiRouter.get("/lookup/epc-wos", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const projectId = parseInt(req.query.projectId as string);
  const q = req.query.q as string | undefined;

  const conditions: any[] = [];
  if (!isNaN(projectId)) conditions.push(eq(epcWorkOrders.projectId, projectId));
  if (q) conditions.push(ilike(epcWorkOrders.woNumber, `%${q}%`));

  const rows = await db.select({
    id: epcWorkOrders.id,
    woNumber: epcWorkOrders.woNumber,
  }).from(epcWorkOrders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(epcWorkOrders.woNumber))
    .limit(50);

  return res.json(rows);
});

oiRouter.get("/lookup/inspection-orders", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const projectId = parseInt(req.query.projectId as string);
  const q = req.query.q as string | undefined;

  const conditions: any[] = [];
  if (!isNaN(projectId)) conditions.push(eq(inspectionOrders.projectId, projectId));
  if (q) {
    const s = `%${q}%`;
    conditions.push(or(
      ilike(inspectionOrders.inspectionOrderNumber, s),
      ilike(inspectionOrders.title, s)
    ));
  }

  const rows = await db.select({
    id: inspectionOrders.id,
    inspectionOrderNumber: inspectionOrders.inspectionOrderNumber,
    title: inspectionOrders.title,
    status: inspectionOrders.status,
  }).from(inspectionOrders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(inspectionOrders.inspectionOrderNumber))
    .limit(50);

  return res.json(rows);
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
    totalOpen:    allOpen[0]?.n    ?? 0,
    criticalOpen: s1Open[0]?.n     ?? 0,
    majorOpen:    s2Open[0]?.n     ?? 0,
    slaBreaches:  (responseSla[0]?.n ?? 0) + (closureSla[0]?.n ?? 0),
    myOpenIssues: myIssues[0]?.n   ?? 0,
  });
});

oiRouter.get("/dashboard/by-status", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const visWhere = buildVisibilityWhere(actor.id, actor.role);
  const rows = await db.select({ status: oiIssues.status, n: count() })
    .from(oiIssues).where(visWhere).groupBy(oiIssues.status);
  return res.json(rows);
});

oiRouter.get("/dashboard/risk-heatmap", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
  const rows = await db.select({
    riskRating: oiIssues.riskRating, severity: oiIssues.severity, n: count(),
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

// ─── Phase 1B Dashboard: Financial Exposure (SM+) ────────────────────────────
oiRouter.get("/dashboard/financial-exposure", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

  const openCondition = sql`status NOT IN ('closed','withdrawn')`;

  const [totals, insuranceOpen, warrantyOpen, byCategory] = await Promise.all([
    db.select({
      totalEstimatedLoss: sql<number>`COALESCE(SUM(estimated_loss_amount),0)`,
      totalActualLoss:    sql<number>`COALESCE(SUM(actual_loss_amount),0)`,
      totalRecovery:      sql<number>`COALESCE(SUM(recovery_amount),0)`,
      totalNetExposure:   sql<number>`COALESCE(SUM(net_financial_exposure),0)`,
    }).from(oiIssues),
    db.select({ n: count() }).from(oiIssues)
      .where(and(openCondition as any, eq(oiIssues.insuranceClaimFlag, true))),
    db.select({ n: count() }).from(oiIssues)
      .where(and(openCondition as any, eq(oiIssues.warrantyClaimFlag, true))),
    db.select({
      category:        oiIssues.category,
      totalNetExposure: sql<number>`COALESCE(SUM(net_financial_exposure),0)`,
      count:            count(),
    }).from(oiIssues)
      .where(isNotNull(oiIssues.actualLossAmount))
      .groupBy(oiIssues.category)
      .orderBy(desc(sql`COALESCE(SUM(net_financial_exposure),0)`)),
  ]);

  return res.json({
    totalEstimatedLoss:   Number(totals[0]?.totalEstimatedLoss ?? 0),
    totalActualLoss:      Number(totals[0]?.totalActualLoss    ?? 0),
    totalRecovery:        Number(totals[0]?.totalRecovery      ?? 0),
    totalNetExposure:     Number(totals[0]?.totalNetExposure   ?? 0),
    insuranceClaimsOpen:  Number(insuranceOpen[0]?.n ?? 0),
    warrantyClaimsOpen:   Number(warrantyOpen[0]?.n  ?? 0),
    byCategory: byCategory.map(r => ({
      category:         r.category,
      totalNetExposure: Number(r.totalNetExposure),
      count:            Number(r.count),
    })),
  });
});

// ─── Phase 1B Dashboard: MTTR (Manager+) ─────────────────────────────────────
oiRouter.get("/dashboard/mttr", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const periodDays = Math.min(365, Math.max(1, parseInt(req.query.periodDays as string) || 90));
  const since = new Date(Date.now() - periodDays * 86400 * 1000);

  const closedWhere = and(
    eq(oiIssues.status, "closed"),
    gte(oiIssues.closedAt, since),
    isNotNull(oiIssues.totalResolutionHours)
  ) as any;

  const [overall, bySeverity, byCategory] = await Promise.all([
    db.select({
      avgMttr: sql<number>`AVG(CAST(total_resolution_hours AS FLOAT))`,
      cnt:     count(),
    }).from(oiIssues).where(closedWhere),
    db.select({
      severity:    oiIssues.severity,
      avgMttr:     sql<number>`AVG(CAST(total_resolution_hours AS FLOAT))`,
      closedCount: count(),
    }).from(oiIssues).where(closedWhere).groupBy(oiIssues.severity),
    db.select({
      category:    oiIssues.category,
      avgMttr:     sql<number>`AVG(CAST(total_resolution_hours AS FLOAT))`,
      closedCount: count(),
    }).from(oiIssues).where(closedWhere).groupBy(oiIssues.category)
      .orderBy(desc(sql`AVG(CAST(total_resolution_hours AS FLOAT))`)),
  ]);

  // Weekly trend
  const trend = await db.select({
    weekStart:   sql<string>`DATE_TRUNC('week', closed_at)`,
    avgMttr:     sql<number>`AVG(CAST(total_resolution_hours AS FLOAT))`,
    closedCount: count(),
  }).from(oiIssues).where(closedWhere)
    .groupBy(sql`DATE_TRUNC('week', closed_at)`)
    .orderBy(asc(sql`DATE_TRUNC('week', closed_at)`));

  return res.json({
    overallMttrHours: overall[0]?.cnt ? Number(overall[0].avgMttr?.toFixed(2) ?? 0) : null,
    bySeverity: bySeverity.map(r => ({
      severity:     r.severity,
      avgMttrHours: r.closedCount ? Number(Number(r.avgMttr).toFixed(2)) : null,
      closedCount:  Number(r.closedCount),
    })),
    byCategory: byCategory.map(r => ({
      category:     r.category,
      avgMttrHours: r.closedCount ? Number(Number(r.avgMttr).toFixed(2)) : null,
      closedCount:  Number(r.closedCount),
    })),
    trend: trend.map(r => ({
      weekStart:   r.weekStart,
      avgMttrHours: r.closedCount ? Number(Number(r.avgMttr).toFixed(2)) : null,
      closedCount:  Number(r.closedCount),
    })),
  });
});

// ─── Phase 1B Dashboard: By Customer (Manager+) ──────────────────────────────
oiRouter.get("/dashboard/by-customer", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.select({
    customerId:   oiIssues.customerId,
    customerName: customers.bpName,
    customerBpCode: sql<string>`${customers.bpCode}`,
    openCount:    sql<number>`SUM(CASE WHEN ${oiIssues.status} NOT IN ('closed','withdrawn') THEN 1 ELSE 0 END)`,
    closedCount:  sql<number>`SUM(CASE WHEN ${oiIssues.status} = 'closed' THEN 1 ELSE 0 END)`,
    totalCount:   count(),
    criticalCount: sql<number>`SUM(CASE WHEN ${oiIssues.severity} IN ('S1','S2') AND ${oiIssues.status} NOT IN ('closed','withdrawn') THEN 1 ELSE 0 END)`,
    avgMttr:      sql<number>`AVG(CASE WHEN ${oiIssues.totalResolutionHours} IS NOT NULL THEN CAST(${oiIssues.totalResolutionHours} AS FLOAT) END)`,
  }).from(oiIssues)
    .innerJoin(customers, eq(oiIssues.customerId, customers.id))
    .groupBy(oiIssues.customerId, customers.bpName, customers.bpCode)
    .orderBy(desc(count()))
    .limit(50);

  return res.json(rows.map(r => ({
    customerId:    r.customerId,
    customerName:  r.customerName,
    customerBpCode: r.customerBpCode,
    openCount:     Number(r.openCount),
    closedCount:   Number(r.closedCount),
    totalCount:    Number(r.totalCount),
    criticalCount: Number(r.criticalCount),
    avgMttrHours:  r.avgMttr != null ? Number(Number(r.avgMttr).toFixed(2)) : null,
  })));
});

// ─── Phase 1B Dashboard: By Vendor (Manager+) ────────────────────────────────
oiRouter.get("/dashboard/by-vendor", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.select({
    vendorId:     oiIssues.vendorId,
    vendorName:   sql<string>`COALESCE(${vendors.displayName}, ${vendors.name})`,
    vendorSapCode: vendors.sapCardCode,
    openCount:    sql<number>`SUM(CASE WHEN ${oiIssues.status} NOT IN ('closed','withdrawn') THEN 1 ELSE 0 END)`,
    closedCount:  sql<number>`SUM(CASE WHEN ${oiIssues.status} = 'closed' THEN 1 ELSE 0 END)`,
    totalCount:   count(),
    criticalCount: sql<number>`SUM(CASE WHEN ${oiIssues.severity} IN ('S1','S2') AND ${oiIssues.status} NOT IN ('closed','withdrawn') THEN 1 ELSE 0 END)`,
    avgMttr:      sql<number>`AVG(CASE WHEN ${oiIssues.totalResolutionHours} IS NOT NULL THEN CAST(${oiIssues.totalResolutionHours} AS FLOAT) END)`,
  }).from(oiIssues)
    .innerJoin(vendors, eq(oiIssues.vendorId, vendors.id))
    .groupBy(oiIssues.vendorId, vendors.displayName, vendors.name, vendors.sapCardCode)
    .orderBy(desc(count()))
    .limit(50);

  return res.json(rows.map(r => ({
    vendorId:     r.vendorId,
    vendorName:   r.vendorName,
    vendorSapCode: r.vendorSapCode,
    openCount:    Number(r.openCount),
    closedCount:  Number(r.closedCount),
    totalCount:   Number(r.totalCount),
    criticalCount: Number(r.criticalCount),
    avgMttrHours: r.avgMttr != null ? Number(Number(r.avgMttr).toFixed(2)) : null,
  })));
});

// ─── Phase 1B Dashboard: Linkage Coverage (Manager+) ─────────────────────────
oiRouter.get("/dashboard/linkage-coverage", async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

  const openWhere = sql`status NOT IN ('closed','withdrawn')`;

  const [row] = await db.select({
    total:              sql<number>`COUNT(*)`,
    withProject:        sql<number>`SUM(CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withCustomer:       sql<number>`SUM(CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withVendor:         sql<number>`SUM(CASE WHEN vendor_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withDrawing:        sql<number>`SUM(CASE WHEN epc_drawing_control_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withPo:             sql<number>`SUM(CASE WHEN epc_po_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withWo:             sql<number>`SUM(CASE WHEN epc_wo_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withIo:             sql<number>`SUM(CASE WHEN inspection_order_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withContract:       sql<number>`SUM(CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END)`,
    withRiskScored:     sql<number>`SUM(CASE WHEN oi_risk_score IS NOT NULL THEN 1 ELSE 0 END)`,
    withFinancialQuantified: sql<number>`SUM(CASE WHEN actual_loss_amount IS NOT NULL THEN 1 ELSE 0 END)`,
  }).from(oiIssues).where(openWhere as any);

  const total = Number(row?.total ?? 0);
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const wp  = Number(row?.withProject ?? 0);
  const wc  = Number(row?.withCustomer ?? 0);
  const wv  = Number(row?.withVendor ?? 0);
  const wd  = Number(row?.withDrawing ?? 0);
  const wpo = Number(row?.withPo ?? 0);
  const wwo = Number(row?.withWo ?? 0);
  const wio = Number(row?.withIo ?? 0);
  const wco = Number(row?.withContract ?? 0);
  const wrs = Number(row?.withRiskScored ?? 0);
  const wfq = Number(row?.withFinancialQuantified ?? 0);

  return res.json({
    totalOpenIssues:        total,
    withProject:            wp,
    withCustomer:           wc,
    withVendor:             wv,
    withDrawing:            wd,
    withPo:                 wpo,
    withWo:                 wwo,
    withIo:                 wio,
    withContract:           wco,
    withRiskScored:         wrs,
    withFinancialQuantified: wfq,
    coveragePct: {
      project:             pct(wp),
      customer:            pct(wc),
      vendor:              pct(wv),
      drawing:             pct(wd),
      po:                  pct(wpo),
      wo:                  pct(wwo),
      io:                  pct(wio),
      contract:            pct(wco),
      riskScored:          pct(wrs),
      financialQuantified: pct(wfq),
    },
  });
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
  const rows = await db.select().from(oiRiskMatrixConfig)
    .orderBy(asc(oiRiskMatrixConfig.probability), asc(oiRiskMatrixConfig.impact));
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
