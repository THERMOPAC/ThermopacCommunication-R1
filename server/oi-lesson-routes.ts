import { Router } from "express";
import { db } from "./db";
import { sql, eq, and, desc, asc, inArray, or } from "drizzle-orm";
import {
  oiLessonRecords, oiLessonLinkages, oiLessonReviewers,
  oiLessonRecurrenceChecks, oiLessonEffectivenessReviews,
  oiLessonAcknowledgments, oiLessonAuditLog,
  oiIssues, oiRcaRecords, oiCapaRecords, oiSopRecords,
  oiEnforcementControls, oiEnforcementHolds, users, projects,
} from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { writeLessonAuditLog } from "./oi-lesson-audit-service";

export const oiLessonRouter = Router();

const MANAGER_ROLES    = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES         = ["Senior Manager", "General Manager", "Superuser"];
const IMMUTABLE_STATES = ["published", "archived"];

const VALID_CATEGORIES = [
  "design_deficiency","procurement_quality","execution_process",
  "testing_commissioning","documentation_control","communication_coordination",
  "vendor_management","planning_scheduling","safety_compliance","technical_deviation",
] as const;

const VALID_TYPES      = ["preventive","corrective","best_practice","observation"] as const;
const VALID_SCOPES     = ["global","department","project","equipment_type"] as const;
const VALID_PRIORITIES = ["low","normal","high","critical"] as const;
const VALID_STATUSES   = ["draft","submitted_for_review","under_review","approved","published","archived"] as const;
const VALID_REC_RISKS  = ["low","medium","high"] as const;
const VALID_LINK_TYPES = ["issue","rca","capa","sop","enforcement_control","enforcement_hold"] as const;
const VALID_EFF_RATINGS = ["highly_effective","effective","partially_effective","not_effective"] as const;

function actorFromReq(req: any) {
  return {
    id:   req.user.id   as number,
    name: (req.user.username || req.user.email) as string,
    role: req.user.role as string,
    ip:   req.ip as string,
  };
}

function computeTitleHash(title: string): string {
  return crypto.createHash("md5").update(title.trim().toLowerCase()).digest("hex");
}

async function updateTsDocument(lessonId: number): Promise<void> {
  await db.execute(sql`
    UPDATE oi_lesson_records
    SET ts_document = to_tsvector('english',
      COALESCE(title,'') || ' ' ||
      COALESCE(description,'') || ' ' ||
      COALESCE(recommendation,'') || ' ' ||
      COALESCE(implementation_guidance,'') || ' ' ||
      COALESCE(array_to_string(tags,' '),'')
    ),
    updated_at = now()
    WHERE id = ${lessonId}
  `);
}

async function nextLessonNumber(): Promise<string> {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = now.getFullYear();
  const prefix = `LLN-${year}-`;
  const [row] = await db.execute(sql`
    SELECT lesson_number FROM oi_lesson_records
    WHERE lesson_number LIKE ${prefix + "%"}
    ORDER BY lesson_number DESC LIMIT 1
  `) as any[];
  if (!row) return `${prefix}001`;
  const last = parseInt((row.lesson_number as string).slice(-3));
  return `${prefix}${String(last + 1).padStart(3, "0")}`;
}

async function fetchLesson(id: number) {
  const [lesson] = await db.select().from(oiLessonRecords).where(eq(oiLessonRecords.id, id)).limit(1);
  return lesson ?? null;
}

async function resolveEntityRef(linkType: string, entityId: number): Promise<string> {
  try {
    if (linkType === "issue") {
      const [r] = await db.select({ n: oiIssues.issueNumber }).from(oiIssues).where(eq(oiIssues.id, entityId)).limit(1);
      return r?.n ?? `ISSUE-${entityId}`;
    }
    if (linkType === "rca") {
      const [r] = await db.select({ n: oiRcaRecords.rcaNumber }).from(oiRcaRecords).where(eq(oiRcaRecords.id, entityId)).limit(1);
      return r?.n ?? `RCA-${entityId}`;
    }
    if (linkType === "capa") {
      const [r] = await db.select({ n: oiCapaRecords.capaNumber }).from(oiCapaRecords).where(eq(oiCapaRecords.id, entityId)).limit(1);
      return r?.n ?? `CAPA-${entityId}`;
    }
    if (linkType === "sop") {
      const [r] = await db.select({ n: oiSopRecords.sopNumber }).from(oiSopRecords).where(eq(oiSopRecords.id, entityId)).limit(1);
      return r?.n ?? `SOP-${entityId}`;
    }
    if (linkType === "enforcement_control") {
      const [r] = await db.select({ n: oiEnforcementControls.controlNumber }).from(oiEnforcementControls).where(eq(oiEnforcementControls.id, entityId)).limit(1);
      return r?.n ?? `EC-${entityId}`;
    }
    if (linkType === "enforcement_hold") {
      const [r] = await db.select({ n: oiEnforcementHolds.holdNumber }).from(oiEnforcementHolds).where(eq(oiEnforcementHolds.id, entityId)).limit(1);
      return r?.n ?? `EH-${entityId}`;
    }
  } catch {}
  return `${linkType.toUpperCase()}-${entityId}`;
}

function wrap(fn: (req: any, res: any) => Promise<any>) {
  return async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (err: any) {
      console.error("[OI-LESSON] Error:", err?.message ?? err);
      if (!res.headersSent) res.status(500).json({ error: "internal_error" });
    }
  };
}

// ─── Static routes BEFORE parameterized :lessonId routes ────────────────────

// GET /lessons/cross-project
oiLessonRouter.get("/lessons/cross-project", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const { category, priority, scope, tags: tagsFilter } = req.query;

  const rows = await db.execute(sql`
    SELECT r.*,
           u.username AS author_name,
           (SELECT COUNT(*) FROM oi_lesson_acknowledgments a WHERE a.lesson_id = r.id AND a.status = 'pending')::int AS pending_acks,
           (SELECT COUNT(*) FROM oi_lesson_acknowledgments a WHERE a.lesson_id = r.id)::int AS total_acks
    FROM oi_lesson_records r
    LEFT JOIN users u ON u.id = r.author_id
    WHERE r.status = 'published'
      AND r.is_current_revision = true
      AND r.cross_project_applicable = true
      AND r.cross_project_approved_at IS NOT NULL
      ${category ? sql`AND r.lesson_category = ${category}` : sql``}
      ${priority ? sql`AND r.priority = ${priority}` : sql``}
      ${scope    ? sql`AND r.applicability_scope = ${scope}` : sql``}
      ${tagsFilter ? sql`AND r.tags @> ${tagsFilter.split(",").map((t: string) => t.trim())}::text[]` : sql``}
    ORDER BY r.lesson_category, r.published_at DESC
  `) as any[];

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const r of rows) {
    const cat = r.lesson_category as string;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      ...r,
      ackCompletionRate: r.total_acks > 0
        ? Math.round(((r.total_acks - r.pending_acks) / r.total_acks) * 100)
        : null,
    });
  }
  return res.json(grouped);
}));

// GET /lessons/tag-suggestions
oiLessonRouter.get("/lessons/tag-suggestions", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.execute(sql`
    SELECT tag, COUNT(*)::int AS usage_count
    FROM oi_lesson_records, unnest(tags) AS tag
    WHERE status <> 'archived'
    GROUP BY tag
    ORDER BY usage_count DESC
    LIMIT 50
  `) as any[];
  return res.json(rows);
}));

// GET /lessons/by-entity/:linkType/:entityId
oiLessonRouter.get("/lessons/by-entity/:linkType/:entityId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const { linkType, entityId } = req.params;
  if (!VALID_LINK_TYPES.includes(linkType as any)) return res.status(400).json({ error: "invalid_link_type" });
  const eid = parseInt(entityId);
  if (isNaN(eid)) return res.status(400).json({ error: "invalid_entity_id" });

  const rows = await db.execute(sql`
    SELECT r.id, r.lesson_number, r.title, r.status, r.lesson_category, r.lesson_type,
           r.priority, r.published_at, r.is_current_revision, r.revision_number,
           lk.id AS linkage_id, lk.linked_entity_ref, lk.link_note
    FROM oi_lesson_linkages lk
    JOIN oi_lesson_records r ON r.id = lk.lesson_id
    WHERE lk.link_type = ${linkType} AND lk.linked_entity_id = ${eid}
      AND r.status <> 'archived'
    ORDER BY r.created_at DESC
  `) as any[];
  return res.json(rows);
}));

// ─── Dashboard endpoints ─────────────────────────────────────────────────────

oiLessonRouter.get("/dashboard/lesson-summary", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const [summary] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status='draft')::int                  AS draft_count,
      COUNT(*) FILTER (WHERE status='submitted_for_review')::int   AS submitted_count,
      COUNT(*) FILTER (WHERE status='under_review')::int           AS under_review_count,
      COUNT(*) FILTER (WHERE status='approved')::int               AS approved_count,
      COUNT(*) FILTER (WHERE status='published')::int              AS published_count,
      COUNT(*) FILTER (WHERE status='archived')::int               AS archived_count,
      COUNT(*) FILTER (WHERE status='published' AND cross_project_applicable=true AND cross_project_approved_at IS NOT NULL)::int AS cross_project_count
    FROM oi_lesson_records
  `) as any[];

  const topCategories = await db.execute(sql`
    SELECT lesson_category, COUNT(*)::int AS cnt
    FROM oi_lesson_records WHERE status='published'
    GROUP BY lesson_category ORDER BY cnt DESC LIMIT 5
  `) as any[];

  const [effDue] = await db.execute(sql`
    SELECT COUNT(*)::int AS overdue_count
    FROM oi_lesson_records r
    WHERE r.status = 'published'
      AND r.effectiveness_review_due_months IS NOT NULL
      AND r.published_at + (r.effectiveness_review_due_months || ' months')::interval < now()
      AND NOT EXISTS (
        SELECT 1 FROM oi_lesson_effectiveness_reviews e
        WHERE e.lesson_id = r.id AND e.review_status = 'completed'
      )
  `) as any[];

  return res.json({ ...summary, topCategories, overdueEffectivenessCount: effDue?.overdue_count ?? 0 });
}));

oiLessonRouter.get("/dashboard/lesson-recurrence-heatmap", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.execute(sql`
    SELECT r.lesson_category AS category, COUNT(*)::int AS recurrence_count
    FROM oi_lesson_recurrence_checks rc
    JOIN oi_lesson_records r ON r.id = rc.lesson_id
    WHERE rc.recurrence_found = true
      AND rc.check_date >= now() - interval '12 months'
    GROUP BY r.lesson_category
    ORDER BY recurrence_count DESC
  `) as any[];
  return res.json(rows);
}));

oiLessonRouter.get("/dashboard/lesson-pipeline", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.execute(sql`
    SELECT r.id, r.lesson_number, r.title, r.lesson_category, r.priority,
           r.status, r.submitted_at, r.review_due_at,
           u.username AS author_name,
           (SELECT COUNT(*) FROM oi_lesson_reviewers rv WHERE rv.lesson_id = r.id)::int AS reviewer_count,
           (SELECT COUNT(*) FROM oi_lesson_reviewers rv WHERE rv.lesson_id = r.id AND rv.review_status = 'pending')::int AS pending_reviewer_count,
           EXTRACT(DAY FROM (r.review_due_at - now()))::int AS days_until_overdue
    FROM oi_lesson_records r
    LEFT JOIN users u ON u.id = r.author_id
    WHERE r.status IN ('submitted_for_review','under_review')
    ORDER BY r.review_due_at ASC NULLS LAST
  `) as any[];
  return res.json(rows);
}));

oiLessonRouter.get("/dashboard/lesson-effectiveness-due", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const rows = await db.execute(sql`
    SELECT r.id, r.lesson_number, r.title, r.lesson_category, r.priority,
           r.published_at, r.effectiveness_review_due_months,
           (r.published_at + (r.effectiveness_review_due_months || ' months')::interval) AS review_due_date
    FROM oi_lesson_records r
    WHERE r.status = 'published'
      AND r.effectiveness_review_due_months IS NOT NULL
      AND (r.published_at + (r.effectiveness_review_due_months || ' months')::interval) < now()
      AND NOT EXISTS (
        SELECT 1 FROM oi_lesson_effectiveness_reviews e
        WHERE e.lesson_id = r.id AND e.review_status = 'completed'
      )
    ORDER BY review_due_date ASC
  `) as any[];
  return res.json(rows);
}));

// ─── CRUD ───────────────────────────────────────────────────────────────────

const createLessonSchema = z.object({
  title:                       z.string().min(5),
  description:                 z.string().min(20),
  lessonCategory:              z.enum(VALID_CATEGORIES),
  lessonType:                  z.enum(VALID_TYPES),
  applicabilityScope:          z.enum(VALID_SCOPES).default("global"),
  scopeDepartment:             z.string().max(100).optional().nullable(),
  scopeProjectId:              z.number().int().optional().nullable(),
  scopeEquipmentType:          z.string().min(2).max(100).optional().nullable(),
  tags:                        z.array(z.string()).max(20).optional().nullable(),
  processArea:                 z.string().max(100).optional().nullable(),
  rootCauseSummary:            z.string().optional().nullable(),
  recommendation:              z.string().min(20),
  implementationGuidance:      z.string().optional().nullable(),
  priority:                    z.enum(VALID_PRIORITIES).default("normal"),
  recurrenceRisk:              z.enum(VALID_REC_RISKS).optional().nullable(),
  crossProjectApplicable:      z.boolean().default(false),
  effectivenessReviewDueMonths: z.number().int().min(1).optional().nullable(),
});

// POST /lessons
oiLessonRouter.post("/lessons", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const body = createLessonSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  // Scope validation
  if (d.applicabilityScope === "department" && !d.scopeDepartment)
    return res.status(422).json({ error: "scope_department_required" });
  if (d.applicabilityScope === "project" && !d.scopeProjectId)
    return res.status(422).json({ error: "scope_project_id_required" });
  if (d.applicabilityScope === "equipment_type" && !d.scopeEquipmentType)
    return res.status(422).json({ error: "scope_equipment_type_required" });

  // Tag normalisation and validation
  const tags = d.tags
    ? d.tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 30)
    : null;
  if (d.tags && d.tags.some(t => t.trim().length > 30))
    return res.status(422).json({ error: "tag_too_long" });
  if (d.tags && d.tags.length > 20)
    return res.status(422).json({ error: "too_many_tags" });

  const titleHash = computeTitleHash(d.title);
  const lessonNumber = await nextLessonNumber();

  // Draft duplicate warning (API-level, not blocking)
  const [dupPublished] = await db.execute(sql`
    SELECT lesson_number FROM oi_lesson_records
    WHERE lesson_category = ${d.lessonCategory}
      AND title_hash = ${titleHash}
      AND status = 'published'
      AND is_current_revision = true
    LIMIT 1
  `) as any[];

  const [lesson] = await db.insert(oiLessonRecords).values({
    lessonNumber,
    parentLessonId: null,
    revisionNumber: 1,
    isCurrentRevision: true,
    title: d.title,
    titleHash,
    description: d.description,
    lessonCategory: d.lessonCategory,
    lessonType: d.lessonType,
    applicabilityScope: d.applicabilityScope,
    scopeDepartment: d.scopeDepartment ?? null,
    scopeProjectId: d.scopeProjectId ?? null,
    scopeEquipmentType: d.scopeEquipmentType ?? null,
    tags: tags ?? null,
    status: "draft",
    processArea: d.processArea ?? null,
    rootCauseSummary: d.rootCauseSummary ?? null,
    recommendation: d.recommendation,
    implementationGuidance: d.implementationGuidance ?? null,
    priority: d.priority,
    recurrenceRisk: d.recurrenceRisk ?? null,
    crossProjectApplicable: d.crossProjectApplicable,
    effectivenessReviewDueMonths: d.effectivenessReviewDueMonths ?? 6,
    authorId: actor.id,
  }).returning();

  await updateTsDocument(lesson.id);
  await writeLessonAuditLog({ lessonId: lesson.id, action: "lesson_created", actorId: actor.id, actorName: actor.name, actorRole: actor.role, ipAddress: actor.ip });

  return res.status(201).json({ ...lesson, duplicate_warning: dupPublished ? dupPublished.lesson_number : null });
}));

// GET /lessons
oiLessonRouter.get("/lessons", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const {
    status: statusFilter, category, lesson_type, applicability_scope,
    author_id, priority, cross_project_applicable,
    tags: tagsFilter, tags_any: tagsAny,
    q, offset = "0", limit = "50", include_all_revisions,
  } = req.query;

  if (q && (q as string).trim().length < 2)
    return res.status(422).json({ error: "search_query_too_short" });

  const rows = await db.execute(sql`
    SELECT r.id, r.lesson_number, r.title, r.status, r.lesson_category, r.lesson_type,
           r.applicability_scope, r.priority, r.cross_project_applicable,
           r.cross_project_approved_at, r.is_current_revision, r.revision_number,
           r.parent_lesson_id, r.tags, r.author_id, r.created_at, r.published_at,
           r.review_due_at, r.submitted_at, r.recurrence_risk,
           u.username AS author_name,
           ${q ? sql`ts_rank(r.ts_document, plainto_tsquery('english', ${q})) AS rank` : sql`0 AS rank`}
    FROM oi_lesson_records r
    LEFT JOIN users u ON u.id = r.author_id
    WHERE 1=1
      ${!include_all_revisions || include_all_revisions === "false" ? sql`AND r.is_current_revision = true` : sql``}
      ${statusFilter ? sql`AND r.status = ANY(${(statusFilter as string).split(",")})` : sql``}
      ${category ? sql`AND r.lesson_category = ANY(${(category as string).split(",")})` : sql``}
      ${lesson_type ? sql`AND r.lesson_type = ${lesson_type}` : sql``}
      ${applicability_scope ? sql`AND r.applicability_scope = ${applicability_scope}` : sql``}
      ${author_id ? sql`AND r.author_id = ${parseInt(author_id as string)}` : sql``}
      ${priority ? sql`AND r.priority = ${priority}` : sql``}
      ${cross_project_applicable === "true" ? sql`AND r.cross_project_applicable = true AND r.cross_project_approved_at IS NOT NULL` : sql``}
      ${tagsFilter ? sql`AND r.tags @> ${(tagsFilter as string).split(",").map(t => t.trim())}::text[]` : sql``}
      ${tagsAny ? sql`AND r.tags && ${(tagsAny as string).split(",").map(t => t.trim())}::text[]` : sql``}
      ${q ? sql`AND r.ts_document @@ plainto_tsquery('english', ${q})` : sql``}
    ORDER BY ${q ? sql`rank DESC,` : sql``} r.created_at DESC
    LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
  `) as any[];

  return res.json(rows);
}));

// GET /lessons/:lessonId — MUST come after /lessons/cross-project, /lessons/tag-suggestions, /lessons/by-entity
oiLessonRouter.get("/lessons/:lessonId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });

  const id = parseInt(req.params.lessonId);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });

  const [reviewers, linkages, acks, recurrenceChecks, effectReviews, auditCount] = await Promise.all([
    db.select().from(oiLessonReviewers).where(eq(oiLessonReviewers.lessonId, id)).orderBy(asc(oiLessonReviewers.assignedAt)),
    db.select().from(oiLessonLinkages).where(eq(oiLessonLinkages.lessonId, id)).orderBy(asc(oiLessonLinkages.createdAt)),
    db.select().from(oiLessonAcknowledgments).where(eq(oiLessonAcknowledgments.lessonId, id)),
    db.select({ cnt: sql<number>`COUNT(*)::int` }).from(oiLessonRecurrenceChecks).where(eq(oiLessonRecurrenceChecks.lessonId, id)),
    db.select({ cnt: sql<number>`COUNT(*)::int` }).from(oiLessonEffectivenessReviews).where(eq(oiLessonEffectivenessReviews.lessonId, id)),
    db.select({ cnt: sql<number>`COUNT(*)::int` }).from(oiLessonAuditLog).where(eq(oiLessonAuditLog.lessonId, id)),
  ]);

  // Revision lineage
  let parentLesson = null;
  if (lesson.parentLessonId) {
    parentLesson = await fetchLesson(lesson.parentLessonId);
  }
  const childRevisions = await db.select({
    id: oiLessonRecords.id, lessonNumber: oiLessonRecords.lessonNumber,
    revisionNumber: oiLessonRecords.revisionNumber, status: oiLessonRecords.status,
  }).from(oiLessonRecords).where(eq(oiLessonRecords.parentLessonId, id));

  // Compute overdue acks at query time
  const now = new Date();
  const acksWithOverdue = acks.map(a => ({
    ...a,
    isOverdue: a.dueDate != null && a.dueDate < now && a.status === "pending",
  }));

  return res.json({
    ...lesson,
    reviewers,
    linkages,
    acknowledgments: acksWithOverdue,
    recurrenceCheckCount: recurrenceChecks[0]?.cnt ?? 0,
    effectivenessReviewCount: effectReviews[0]?.cnt ?? 0,
    parentLesson: parentLesson ? { id: parentLesson.id, lessonNumber: parentLesson.lessonNumber, revisionNumber: parentLesson.revisionNumber, status: parentLesson.status } : null,
    childRevisions,
  });
}));

const patchLessonSchema = createLessonSchema.partial();

// PATCH /lessons/:lessonId
oiLessonRouter.patch("/lessons/:lessonId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.lessonId);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });

  if (IMMUTABLE_STATES.includes(lesson.status))
    return res.status(423).json({ error: "lesson_locked", status: lesson.status });

  // Author edits draft; SM+ edits any non-published state
  const isAuthor = lesson.authorId === actor.id;
  const isSm = SM_ROLES.includes(actor.role);
  if (lesson.status === "draft" && !isAuthor && !isSm)
    return res.status(403).json({ error: "forbidden" });
  if (lesson.status !== "draft" && !isSm)
    return res.status(403).json({ error: "forbidden_sm_only" });

  const body = patchLessonSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  if (d.tags && d.tags.some(t => t.trim().length > 30)) return res.status(422).json({ error: "tag_too_long" });
  if (d.tags && d.tags.length > 20) return res.status(422).json({ error: "too_many_tags" });

  const updates: Partial<typeof oiLessonRecords.$inferInsert> = {};
  const auditFields: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

  const fields: Array<[keyof typeof d, keyof typeof lesson]> = [
    ["title","title"],["description","description"],["recommendation","recommendation"],
    ["implementationGuidance","implementationGuidance"],["lessonCategory","lessonCategory"],
    ["lessonType","lessonType"],["applicabilityScope","applicabilityScope"],
    ["scopeDepartment","scopeDepartment"],["scopeEquipmentType","scopeEquipmentType"],
    ["priority","priority"],["recurrenceRisk","recurrenceRisk"],
    ["crossProjectApplicable","crossProjectApplicable"],
    ["processArea","processArea"],["rootCauseSummary","rootCauseSummary"],
    ["effectivenessReviewDueMonths","effectivenessReviewDueMonths"],
  ];

  for (const [dk, lk] of fields) {
    if (d[dk] !== undefined && d[dk] !== (lesson as any)[lk]) {
      const old = String((lesson as any)[lk] ?? "");
      const nw  = String(d[dk] ?? "");
      (updates as any)[lk] = d[dk];
      auditFields.push({ fieldName: lk as string, oldValue: old, newValue: nw });
    }
  }

  if (d.scopeProjectId !== undefined && d.scopeProjectId !== lesson.scopeProjectId) {
    updates.scopeProjectId = d.scopeProjectId ?? null;
    auditFields.push({ fieldName: "scopeProjectId", oldValue: String(lesson.scopeProjectId ?? ""), newValue: String(d.scopeProjectId ?? "") });
  }
  if (d.tags !== undefined) {
    const tags = d.tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
    updates.tags = tags;
    auditFields.push({ fieldName: "tags", oldValue: (lesson.tags ?? []).join(","), newValue: tags.join(",") });
  }
  if (d.title !== undefined) {
    updates.titleHash = computeTitleHash(d.title);
  }

  if (Object.keys(updates).length === 0) return res.json(lesson);

  (updates as any).updatedAt = new Date();
  const [updated] = await db.update(oiLessonRecords).set(updates).where(eq(oiLessonRecords.id, id)).returning();

  await updateTsDocument(id);

  for (const f of auditFields) {
    await writeLessonAuditLog({ lessonId: id, action: "lesson_created" as any, actorId: actor.id, actorName: actor.name, actorRole: actor.role, fieldName: f.fieldName, oldValue: f.oldValue, newValue: f.newValue });
  }

  return res.json(updated);
}));

// GET /lessons/:lessonId/audit-log
oiLessonRouter.get("/lessons/:lessonId/audit-log", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.lessonId);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  const logs = await db.select().from(oiLessonAuditLog)
    .where(eq(oiLessonAuditLog.lessonId, id))
    .orderBy(desc(oiLessonAuditLog.createdAt));
  return res.json(logs);
}));

// ─── Lifecycle Transitions ───────────────────────────────────────────────────

// POST /lessons/:id/submit
oiLessonRouter.post("/lessons/:id/submit", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (!["draft","rejected"].includes(lesson.status)) return res.status(409).json({ error: "invalid_transition", current: lesson.status });
  if (lesson.authorId !== actor.id && !SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden_author_only" });

  if (lesson.title.length < 5) return res.status(422).json({ error: "title_too_short" });
  if (lesson.description.length < 20) return res.status(422).json({ error: "description_too_short" });
  if (lesson.recommendation.length < 20) return res.status(422).json({ error: "recommendation_too_short" });

  const now = new Date();
  const reviewDueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [updated] = await db.update(oiLessonRecords).set({
    status: "submitted_for_review", submittedAt: now, reviewDueAt, updatedAt: now,
  }).where(eq(oiLessonRecords.id, id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_submitted_for_review", actorId: actor.id, actorName: actor.name, actorRole: actor.role, ipAddress: actor.ip });
  return res.json(updated);
}));

// POST /lessons/:id/approve
oiLessonRouter.post("/lessons/:id/approve", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "under_review") return res.status(409).json({ error: "invalid_transition", current: lesson.status });

  // Segregation: approver ≠ author
  if (lesson.authorId === actor.id) return res.status(422).json({ error: "approver_is_author" });

  const reviewers = await db.select().from(oiLessonReviewers).where(eq(oiLessonReviewers.lessonId, id));

  // Segregation: approver ≠ any reviewer
  if (reviewers.some(r => r.reviewerId === actor.id)) return res.status(422).json({ error: "approver_is_reviewer" });

  // At least one approved vote
  const activeReviewers = reviewers.filter(r => r.reviewStatus !== "recused");
  if (!activeReviewers.some(r => r.reviewStatus === "approved")) return res.status(422).json({ error: "no_approved_reviewer_vote" });

  // No outstanding rejected vote
  if (activeReviewers.some(r => r.reviewStatus === "rejected")) return res.status(422).json({ error: "rejected_reviewer_vote_outstanding" });

  const now = new Date();
  const [updated] = await db.update(oiLessonRecords).set({
    status: "approved", approvedBy: actor.id, approvedAt: now, updatedAt: now,
  }).where(eq(oiLessonRecords.id, id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_approved", actorId: actor.id, actorName: actor.name, actorRole: actor.role, ipAddress: actor.ip });
  return res.json(updated);
}));

const rejectSchema = z.object({ rejectionReason: z.string().min(20) });

// POST /lessons/:id/reject
oiLessonRouter.post("/lessons/:id/reject", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (!["submitted_for_review","under_review"].includes(lesson.status))
    return res.status(409).json({ error: "invalid_transition", current: lesson.status });

  const body = rejectSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });

  const now = new Date();
  const [updated] = await db.update(oiLessonRecords).set({
    status: "rejected", rejectedBy: actor.id, rejectedAt: now,
    rejectionReason: body.data.rejectionReason, updatedAt: now,
  }).where(eq(oiLessonRecords.id, id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_rejected", actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: body.data.rejectionReason.substring(0, 200), ipAddress: actor.ip });
  return res.json(updated);
}));

// POST /lessons/:id/publish
oiLessonRouter.post("/lessons/:id/publish", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "approved") return res.status(409).json({ error: "invalid_transition", current: lesson.status });

  // Duplicate check (DB unique index will enforce, but give friendly error)
  const now = new Date();

  // Atomic transaction: publish + auto-archive parent chain if revision
  await db.transaction(async (tx) => {
    await tx.update(oiLessonRecords).set({
      status: "published", publishedBy: actor.id, publishedAt: now, updatedAt: now,
    }).where(eq(oiLessonRecords.id, id));

    // If this is a revision, archive parent chain
    if (lesson.parentLessonId) {
      let ancestorId: number | null = lesson.parentLessonId;
      while (ancestorId) {
        const [ancestor] = await tx.select().from(oiLessonRecords).where(eq(oiLessonRecords.id, ancestorId)).limit(1);
        if (!ancestor) break;
        await tx.update(oiLessonRecords).set({
          status: "archived",
          isCurrentRevision: false,
          archivedAt: now,
          archiveReason: `Superseded by revision ${lesson.lessonNumber}`,
          updatedAt: now,
        }).where(eq(oiLessonRecords.id, ancestor.id));
        ancestorId = ancestor.parentLessonId;
      }
    }
  });

  await writeLessonAuditLog({ lessonId: id, action: "lesson_published", actorId: actor.id, actorName: actor.name, actorRole: actor.role, ipAddress: actor.ip });
  return res.json(await fetchLesson(id));
}));

const archiveSchema = z.object({ archiveReason: z.string().min(10) });

// POST /lessons/:id/archive
oiLessonRouter.post("/lessons/:id/archive", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "published") return res.status(409).json({ error: "invalid_transition", current: lesson.status });

  const body = archiveSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });

  const now = new Date();
  const [updated] = await db.update(oiLessonRecords).set({
    status: "archived", archivedBy: actor.id, archivedAt: now,
    archiveReason: body.data.archiveReason, isCurrentRevision: false, updatedAt: now,
  }).where(eq(oiLessonRecords.id, id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_archived", actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: body.data.archiveReason.substring(0, 200), ipAddress: actor.ip });
  return res.json(updated);
}));

// POST /lessons/:id/revise
oiLessonRouter.post("/lessons/:id/revise", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const source = await fetchLesson(id);
  if (!source) return res.status(404).json({ error: "lesson_not_found" });
  if (source.status !== "published") return res.status(409).json({ error: "source_not_published", current: source.status });

  const newLessonNumber = await nextLessonNumber();
  const [newLesson] = await db.insert(oiLessonRecords).values({
    lessonNumber:                newLessonNumber,
    parentLessonId:              source.id,
    revisionNumber:              source.revisionNumber + 1,
    isCurrentRevision:           true,
    title:                       source.title,
    titleHash:                   source.titleHash,
    description:                 source.description,
    lessonCategory:              source.lessonCategory,
    lessonType:                  source.lessonType,
    applicabilityScope:          source.applicabilityScope,
    scopeDepartment:             source.scopeDepartment,
    scopeProjectId:              source.scopeProjectId,
    scopeEquipmentType:          source.scopeEquipmentType,
    tags:                        source.tags,
    status:                      "draft",
    processArea:                 source.processArea,
    rootCauseSummary:            source.rootCauseSummary,
    recommendation:              source.recommendation,
    implementationGuidance:      source.implementationGuidance,
    priority:                    source.priority,
    recurrenceRisk:              source.recurrenceRisk,
    crossProjectApplicable:      source.crossProjectApplicable,
    effectivenessReviewDueMonths: source.effectivenessReviewDueMonths,
    authorId:                    actor.id,
  }).returning();

  await updateTsDocument(newLesson.id);

  await writeLessonAuditLog({ lessonId: source.id, action: "lesson_revised", actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `New revision: ${newLessonNumber}`, ipAddress: actor.ip });
  await writeLessonAuditLog({ lessonId: newLesson.id, action: "lesson_revised", actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `Revised from: ${source.lessonNumber}`, ipAddress: actor.ip });

  return res.status(201).json(newLesson);
}));

// POST /lessons/:id/approve-cross-project
oiLessonRouter.post("/lessons/:id/approve-cross-project", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "published") return res.status(409).json({ error: "lesson_not_published" });
  if (!lesson.crossProjectApplicable) return res.status(422).json({ error: "not_cross_project_applicable" });
  if (lesson.crossProjectApprovedAt) return res.status(409).json({ error: "already_cross_project_approved" });

  const now = new Date();
  const [updated] = await db.update(oiLessonRecords).set({
    crossProjectApprovedBy: actor.id, crossProjectApprovedAt: now, updatedAt: now,
  }).where(eq(oiLessonRecords.id, id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_cross_project_approved", actorId: actor.id, actorName: actor.name, actorRole: actor.role, ipAddress: actor.ip });
  return res.json(updated);
}));

// ─── Linkages ────────────────────────────────────────────────────────────────

const linkageSchema = z.object({
  linkType:       z.enum(VALID_LINK_TYPES),
  linkedEntityId: z.number().int().positive(),
  linkNote:       z.string().max(500).optional().nullable(),
});

// POST /lessons/:id/linkages
oiLessonRouter.post("/lessons/:id/linkages", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (IMMUTABLE_STATES.includes(lesson.status)) return res.status(423).json({ error: "lesson_locked" });

  const body = linkageSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const { linkType, linkedEntityId, linkNote } = body.data;

  const ref = await resolveEntityRef(linkType, linkedEntityId);

  // Duplicate-entity API check for published lessons
  const [dupLesson] = await db.execute(sql`
    SELECT r.lesson_number FROM oi_lesson_linkages lk
    JOIN oi_lesson_records r ON r.id = lk.lesson_id
    WHERE lk.link_type = ${linkType} AND lk.linked_entity_id = ${linkedEntityId}
      AND r.lesson_category = ${lesson.lessonCategory}
      AND r.status = 'published' AND r.is_current_revision = true
      AND r.id <> ${id}
    LIMIT 1
  `) as any[];
  if (dupLesson) return res.status(409).json({ error: "duplicate_lesson_for_entity", conflicting_lesson_number: dupLesson.lesson_number });

  try {
    const [linkage] = await db.insert(oiLessonLinkages).values({
      lessonId: id, linkType, linkedEntityId, linkedEntityRef: ref, linkNote: linkNote ?? null, createdBy: actor.id,
    }).returning();
    await writeLessonAuditLog({ lessonId: id, action: "lesson_linked", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: `${linkType}:${linkedEntityId}`, ipAddress: actor.ip });
    return res.status(201).json(linkage);
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "linkage_already_exists" });
    throw err;
  }
}));

// GET /lessons/:id/linkages
oiLessonRouter.get("/lessons/:id/linkages", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  const linkages = await db.select().from(oiLessonLinkages).where(eq(oiLessonLinkages.lessonId, id)).orderBy(asc(oiLessonLinkages.createdAt));
  return res.json(linkages);
}));

// DELETE /lessons/:id/linkages/:linkId
oiLessonRouter.delete("/lessons/:id/linkages/:linkId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  const linkId = parseInt(req.params.linkId);
  if (isNaN(id) || isNaN(linkId)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (IMMUTABLE_STATES.includes(lesson.status)) return res.status(423).json({ error: "lesson_locked" });

  const [deleted] = await db.delete(oiLessonLinkages)
    .where(and(eq(oiLessonLinkages.id, linkId), eq(oiLessonLinkages.lessonId, id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "linkage_not_found" });

  await writeLessonAuditLog({ lessonId: id, action: "lesson_unlinked", actorId: actor.id, actorName: actor.name, actorRole: actor.role, oldValue: `${deleted.linkType}:${deleted.linkedEntityId}`, ipAddress: actor.ip });
  return res.json({ success: true });
}));

// ─── Reviewers ───────────────────────────────────────────────────────────────

const assignReviewerSchema = z.object({ reviewerId: z.number().int().positive() });

// POST /lessons/:id/reviewers
oiLessonRouter.post("/lessons/:id/reviewers", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (!["submitted_for_review","under_review"].includes(lesson.status))
    return res.status(409).json({ error: "invalid_state_for_reviewer_assignment", current: lesson.status });

  const body = assignReviewerSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const { reviewerId } = body.data;

  if (reviewerId === lesson.authorId) return res.status(422).json({ error: "reviewer_is_author" });

  // Reviewer must be Manager+
  const [reviewer] = await db.select({ role: users.role }).from(users).where(eq(users.id, reviewerId)).limit(1);
  if (!reviewer) return res.status(404).json({ error: "reviewer_not_found" });
  if (!MANAGER_ROLES.includes(reviewer.role)) return res.status(422).json({ error: "reviewer_insufficient_role" });

  try {
    const [rv] = await db.insert(oiLessonReviewers).values({
      lessonId: id, reviewerId, reviewStatus: "pending", assignedBy: actor.id,
    }).returning();

    // Move to under_review if first reviewer
    if (lesson.status === "submitted_for_review") {
      await db.update(oiLessonRecords).set({ status: "under_review", updatedAt: new Date() }).where(eq(oiLessonRecords.id, id));
    }

    await writeLessonAuditLog({ lessonId: id, action: "lesson_reviewer_assigned", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: String(reviewerId), ipAddress: actor.ip });
    return res.status(201).json(rv);
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "reviewer_already_assigned" });
    throw err;
  }
}));

// GET /lessons/:id/reviewers
oiLessonRouter.get("/lessons/:id/reviewers", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  const reviewers = await db.select().from(oiLessonReviewers).where(eq(oiLessonReviewers.lessonId, id)).orderBy(asc(oiLessonReviewers.assignedAt));
  return res.json(reviewers);
}));

const voteSchema = z.object({
  vote:       z.enum(["approved","rejected"]),
  reviewNote: z.string().optional().nullable(),
});

// POST /lessons/:id/reviewers/:reviewerId/vote
oiLessonRouter.post("/lessons/:id/reviewers/:reviewerId/vote", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  const reviewerId = parseInt(req.params.reviewerId);
  if (isNaN(id) || isNaN(reviewerId)) return res.status(400).json({ error: "invalid_id" });

  // Self-vote only
  if (actor.id !== reviewerId) return res.status(403).json({ error: "not_assigned_reviewer" });

  const [rv] = await db.select().from(oiLessonReviewers)
    .where(and(eq(oiLessonReviewers.lessonId, id), eq(oiLessonReviewers.reviewerId, reviewerId))).limit(1);
  if (!rv) return res.status(404).json({ error: "reviewer_assignment_not_found" });

  const body = voteSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });

  const [updated] = await db.update(oiLessonReviewers).set({
    reviewStatus: body.data.vote, reviewNote: body.data.reviewNote ?? null, reviewedAt: new Date(),
  }).where(eq(oiLessonReviewers.id, rv.id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_reviewer_voted", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: body.data.vote, ipAddress: actor.ip });
  return res.json(updated);
}));

// POST /lessons/:id/reviewers/:reviewerId/recuse
oiLessonRouter.post("/lessons/:id/reviewers/:reviewerId/recuse", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  const id = parseInt(req.params.id);
  const reviewerId = parseInt(req.params.reviewerId);
  if (isNaN(id) || isNaN(reviewerId)) return res.status(400).json({ error: "invalid_id" });

  // Self or SM+
  if (actor.id !== reviewerId && !SM_ROLES.includes(actor.role))
    return res.status(403).json({ error: "forbidden" });

  const [rv] = await db.select().from(oiLessonReviewers)
    .where(and(eq(oiLessonReviewers.lessonId, id), eq(oiLessonReviewers.reviewerId, reviewerId))).limit(1);
  if (!rv) return res.status(404).json({ error: "reviewer_assignment_not_found" });

  const [updated] = await db.update(oiLessonReviewers).set({
    reviewStatus: "recused", reviewedAt: new Date(),
  }).where(eq(oiLessonReviewers.id, rv.id)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_review_recused", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: String(reviewerId), ipAddress: actor.ip });
  return res.json(updated);
}));

// ─── Recurrence Checks ───────────────────────────────────────────────────────

const recurrenceCheckSchema = z.object({
  checkDate:        z.string(),
  recurrenceFound:  z.boolean().default(false),
  recurrenceDetail: z.string().optional().nullable(),
  linkedIssueId:    z.number().int().positive().optional().nullable(),
  linkedRcaId:      z.number().int().positive().optional().nullable(),
  recommendation:   z.string().optional().nullable(),
});

// POST /lessons/:id/recurrence-checks
oiLessonRouter.post("/lessons/:id/recurrence-checks", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "published") return res.status(409).json({ error: "lesson_not_published" });

  const body = recurrenceCheckSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  const checkDate = new Date(d.checkDate);
  if (isNaN(checkDate.getTime())) return res.status(422).json({ error: "invalid_check_date" });
  if (checkDate > new Date()) return res.status(422).json({ error: "check_date_in_future" });

  // Recurrence governance C4
  if (d.recurrenceFound) {
    if (!d.recurrenceDetail || d.recurrenceDetail.length < 20)
      return res.status(422).json({ error: "recurrence_detail_required_min_20_chars" });
    if (!d.linkedIssueId && !d.linkedRcaId)
      return res.status(422).json({ error: "linked_issue_or_rca_required_when_recurrence_found" });
  }

  const [check] = await db.insert(oiLessonRecurrenceChecks).values({
    lessonId:         id,
    checkDate,
    checkerId:        actor.id,
    recurrenceFound:  d.recurrenceFound,
    recurrenceDetail: d.recurrenceDetail ?? null,
    linkedIssueId:    d.linkedIssueId ?? null,
    linkedRcaId:      d.linkedRcaId ?? null,
    recommendation:   d.recommendation ?? null,
  }).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_recurrence_recorded", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: d.recurrenceFound ? "recurrence_found" : "no_recurrence", ipAddress: actor.ip });
  return res.status(201).json(check);
}));

// GET /lessons/:id/recurrence-checks
oiLessonRouter.get("/lessons/:id/recurrence-checks", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  const checks = await db.select().from(oiLessonRecurrenceChecks)
    .where(eq(oiLessonRecurrenceChecks.lessonId, id)).orderBy(desc(oiLessonRecurrenceChecks.checkDate));
  return res.json(checks);
}));

// DELETE /lessons/:id/recurrence-checks/:checkId
oiLessonRouter.delete("/lessons/:id/recurrence-checks/:checkId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  const checkId = parseInt(req.params.checkId);
  if (isNaN(id) || isNaN(checkId)) return res.status(400).json({ error: "invalid_id" });

  const [deleted] = await db.delete(oiLessonRecurrenceChecks)
    .where(and(eq(oiLessonRecurrenceChecks.id, checkId), eq(oiLessonRecurrenceChecks.lessonId, id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "check_not_found" });

  await writeLessonAuditLog({ lessonId: id, action: "lesson_recurrence_recorded", actorId: actor.id, actorName: actor.name, actorRole: actor.role, context: `Recurrence check ${checkId} deleted`, ipAddress: actor.ip });
  return res.json({ success: true });
}));

// ─── Effectiveness Reviews ───────────────────────────────────────────────────

const effectivenessSchema = z.object({
  reviewDate:          z.string(),
  reviewStatus:        z.enum(["pending","completed","deferred"]),
  effectivenessRating: z.enum(VALID_EFF_RATINGS).optional().nullable(),
  observations:        z.string().optional().nullable(),
  recommendation:      z.string().optional().nullable(),
  nextReviewDue:       z.string().optional().nullable(),
});

// POST /lessons/:id/effectiveness-reviews
oiLessonRouter.post("/lessons/:id/effectiveness-reviews", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "published") return res.status(409).json({ error: "lesson_not_published" });

  const body = effectivenessSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  const reviewDate = new Date(d.reviewDate);
  if (isNaN(reviewDate.getTime())) return res.status(422).json({ error: "invalid_review_date" });
  if (reviewDate > new Date()) return res.status(422).json({ error: "review_date_in_future" });

  if (d.reviewStatus === "completed") {
    if (!d.effectivenessRating) return res.status(422).json({ error: "effectiveness_rating_required_when_completed" });
    if (!d.observations || d.observations.length < 20) return res.status(422).json({ error: "observations_required_min_20_chars" });
  }

  const [review] = await db.insert(oiLessonEffectivenessReviews).values({
    lessonId:            id,
    reviewDate,
    reviewerId:          actor.id,
    reviewStatus:        d.reviewStatus,
    effectivenessRating: d.effectivenessRating ?? null,
    observations:        d.observations ?? null,
    recommendation:      d.recommendation ?? null,
    nextReviewDue:       d.nextReviewDue ? new Date(d.nextReviewDue) : null,
  }).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_effectiveness_reviewed", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: d.reviewStatus, ipAddress: actor.ip });
  return res.status(201).json(review);
}));

// GET /lessons/:id/effectiveness-reviews
oiLessonRouter.get("/lessons/:id/effectiveness-reviews", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });
  const reviews = await db.select().from(oiLessonEffectivenessReviews)
    .where(eq(oiLessonEffectivenessReviews.lessonId, id)).orderBy(desc(oiLessonEffectivenessReviews.reviewDate));
  return res.json(reviews);
}));

// PATCH /lessons/:id/effectiveness-reviews/:reviewId
oiLessonRouter.patch("/lessons/:id/effectiveness-reviews/:reviewId", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  const reviewId = parseInt(req.params.reviewId);
  if (isNaN(id) || isNaN(reviewId)) return res.status(400).json({ error: "invalid_id" });

  const [existing] = await db.select().from(oiLessonEffectivenessReviews)
    .where(and(eq(oiLessonEffectivenessReviews.id, reviewId), eq(oiLessonEffectivenessReviews.lessonId, id))).limit(1);
  if (!existing) return res.status(404).json({ error: "review_not_found" });
  if (existing.reviewStatus !== "pending") return res.status(409).json({ error: "only_pending_reviews_editable" });

  const body = effectivenessSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  const updates: any = {};
  if (d.reviewStatus !== undefined) updates.reviewStatus = d.reviewStatus;
  if (d.effectivenessRating !== undefined) updates.effectivenessRating = d.effectivenessRating;
  if (d.observations !== undefined) updates.observations = d.observations;
  if (d.recommendation !== undefined) updates.recommendation = d.recommendation;
  if (d.nextReviewDue !== undefined) updates.nextReviewDue = d.nextReviewDue ? new Date(d.nextReviewDue) : null;

  if (updates.reviewStatus === "completed") {
    if (!updates.effectivenessRating && !existing.effectivenessRating) return res.status(422).json({ error: "effectiveness_rating_required_when_completed" });
    const obs = updates.observations ?? existing.observations;
    if (!obs || obs.length < 20) return res.status(422).json({ error: "observations_required_min_20_chars" });
  }

  const [updated] = await db.update(oiLessonEffectivenessReviews).set(updates)
    .where(eq(oiLessonEffectivenessReviews.id, reviewId)).returning();

  await writeLessonAuditLog({ lessonId: id, action: "lesson_effectiveness_reviewed", actorId: actor.id, actorName: actor.name, actorRole: actor.role, newValue: updated.reviewStatus, ipAddress: actor.ip });
  return res.json(updated);
}));

// ─── Acknowledgments ─────────────────────────────────────────────────────────

const ackAssignSchema = z.object({
  acknowledgmentType: z.enum(["department","project"]),
  targetDepartment:   z.string().max(100).optional().nullable(),
  targetProjectId:    z.number().int().positive().optional().nullable(),
  isRequired:         z.boolean().default(true),
  dueDate:            z.string().optional().nullable(),
});

// POST /lessons/:id/acknowledgments
oiLessonRouter.post("/lessons/:id/acknowledgments", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!SM_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const lesson = await fetchLesson(id);
  if (!lesson) return res.status(404).json({ error: "lesson_not_found" });
  if (lesson.status !== "published") return res.status(409).json({ error: "lesson_not_published" });
  if (!lesson.crossProjectApprovedAt) return res.status(422).json({ error: "lesson_not_cross_project_approved" });

  const body = ackAssignSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation_error", details: body.error.flatten() });
  const d = body.data;

  if (d.acknowledgmentType === "department" && !d.targetDepartment)
    return res.status(422).json({ error: "target_department_required" });
  if (d.acknowledgmentType === "project" && !d.targetProjectId)
    return res.status(422).json({ error: "target_project_id_required" });

  try {
    const [ack] = await db.insert(oiLessonAcknowledgments).values({
      lessonId:           id,
      acknowledgmentType: d.acknowledgmentType,
      targetDepartment:   d.targetDepartment ?? null,
      targetProjectId:    d.targetProjectId ?? null,
      isRequired:         d.isRequired,
      dueDate:            d.dueDate ? new Date(d.dueDate) : null,
      status:             "pending",
      assignedBy:         actor.id,
    }).returning();

    await writeLessonAuditLog({
      lessonId: id, action: "lesson_acknowledgment_required",
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      newValue: `${d.acknowledgmentType}:${d.targetDepartment ?? d.targetProjectId}`,
      context: `Acknowledgment required by ${d.dueDate ?? "no due date"}`,
      ipAddress: actor.ip,
    });
    return res.status(201).json(ack);
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "acknowledgment_already_assigned" });
    throw err;
  }
}));

// GET /lessons/:id/acknowledgments
oiLessonRouter.get("/lessons/:id/acknowledgments", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid_id" });

  const acks = await db.select().from(oiLessonAcknowledgments)
    .where(eq(oiLessonAcknowledgments.lessonId, id))
    .orderBy(asc(oiLessonAcknowledgments.assignedAt));

  const now = new Date();
  return res.json(acks.map(a => ({
    ...a,
    isOverdue: a.dueDate != null && a.dueDate < now && a.status === "pending",
  })));
}));

// POST /lessons/:id/acknowledgments/:ackId/acknowledge
oiLessonRouter.post("/lessons/:id/acknowledgments/:ackId/acknowledge", wrap(async (req: any, res: any) => {
  const actor = actorFromReq(req);
  if (!MANAGER_ROLES.includes(actor.role)) return res.status(403).json({ error: "forbidden" });
  const id = parseInt(req.params.id);
  const ackId = parseInt(req.params.ackId);
  if (isNaN(id) || isNaN(ackId)) return res.status(400).json({ error: "invalid_id" });

  const [ack] = await db.select().from(oiLessonAcknowledgments)
    .where(and(eq(oiLessonAcknowledgments.id, ackId), eq(oiLessonAcknowledgments.lessonId, id))).limit(1);
  if (!ack) return res.status(404).json({ error: "acknowledgment_not_found" });
  if (ack.status !== "pending") return res.status(409).json({ error: "already_acknowledged" });

  const { acknowledgmentNote } = req.body;
  const now = new Date();
  const [updated] = await db.update(oiLessonAcknowledgments).set({
    acknowledgedBy: actor.id, acknowledgedAt: now, status: "acknowledged",
    acknowledgmentNote: acknowledgmentNote ?? null,
  }).where(eq(oiLessonAcknowledgments.id, ackId)).returning();

  await writeLessonAuditLog({
    lessonId: id, action: "lesson_acknowledged",
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    newValue: "acknowledged",
    context: `Acknowledged by ${actor.name} (${actor.role})`,
    ipAddress: actor.ip,
  });
  return res.json(updated);
}));
