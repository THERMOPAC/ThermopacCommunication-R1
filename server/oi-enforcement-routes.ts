import { Router } from "express";
import { db } from "./db";
import {
  oiEnforcementControls, oiEnforcementChecklists, oiEnforcementHolds,
  oiEnforcementChecklistResponses, oiEnforcementAuditLog,
  oiSopRecords, oiSopRevisions, users, projects,
  departmentMaster,
} from "@shared/schema";
import { eq, and, or, desc, asc, count, sql, inArray, ne } from "drizzle-orm";
import { writeEnforcementAuditLog } from "./oi-enforcement-audit-service";

export const oiEnforcementRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────
const MANAGER_ROLES   = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES        = ["Senior Manager", "General Manager", "Superuser"];
const SUPERUSER_ROLES = ["Superuser"];

const VALID_ERP_ENTITY_TYPES = [
  "epc_purchase_order","epc_work_order","epc_dispatch_readiness",
  "epc_commissioning_readiness","inspection_execution",
  "purchase_order","work_order",
];
const VALID_CONTROL_TYPES = [
  "hold_point","qc_hold","dispatch_hold","procurement_hold",
  "drawing_gate","fat_block","sat_block","commissioning_block",
  "procurement_blocked_vendor","procurement_missing_tbe_cbe",
  "procurement_missing_qc_requirement","procurement_expired_vendor_qualification",
];
const VALID_ENFORCEMENT_LEVELS = ["advisory","mandatory"];
const VALID_ENFORCEMENT_SCOPES = ["global","department","project","equipment_type"];
const VALID_HOLD_STATUSES      = ["open","approved_to_proceed","released","overridden","emergency_bypassed"];

// Amendment B: hardcoded fallback — used only if DB query fails or returns 0 rows.
// _validDepts is NEVER left empty. Three-layer guard below.
const DEPT_HARDCODED_FALLBACK_ENF = new Set([
  "Accounts","Administration","After Sales","Design","Marketing",
  "Production","Projects","Purchase","Quality Control","Stores",
]);
let _validDeptsEnf: Set<string> = new Set(DEPT_HARDCODED_FALLBACK_ENF); // safe default at module load

export async function loadValidDepartmentsEnforcement(): Promise<void> {
  try {
    const rows = await db
      .select({ name: departmentMaster.name })
      .from(departmentMaster)
      .where(eq(departmentMaster.isActive, true));
    if (rows.length > 0) {
      // Guard 1 (normal path): DB returned rows — use them.
      _validDeptsEnf = new Set(rows.map(r => r.name));
      console.log(`[DeptSeed] Enforcement _validDepts loaded from DB — ${_validDeptsEnf.size} active departments.`);
    } else {
      // Guard 2 (empty table): fall back to hardcoded list.
      _validDeptsEnf = new Set(DEPT_HARDCODED_FALLBACK_ENF);
      console.warn("[DeptSeed] WARNING: department_master has 0 active rows (Enforcement) — using hardcoded fallback. Run seed.");
    }
  } catch (err) {
    // Guard 3 (DB failure): do NOT reassign — module-init hardcoded value remains active.
    console.error("[DeptSeed] ERROR: Failed to load valid departments (Enforcement) — retaining fallback:", err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function actor(req: any) {
  return {
    id:   req.user.id as number,
    name: (req.user.name || req.user.username || "Unknown") as string,
    role: (req.user.role || "Employee") as string,
    ip:   (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "") as string,
  };
}
function hasRole(role: string, allowed: string[]): boolean { return allowed.includes(role); }

async function nextControlNumber(): Promise<string> {
  const year = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getFullYear();
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('enf_control_number_seq'))`);
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM oi_enforcement_controls WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = ${year}`
  );
  const cnt = Number((result as any).rows?.[0]?.cnt ?? 0);
  return `ENF-${year}-${String(cnt + 1).padStart(3, "0")}`;
}

async function nextHoldNumber(): Promise<string> {
  const year = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getFullYear();
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('enf_hold_number_seq'))`);
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt FROM oi_enforcement_holds WHERE EXTRACT(YEAR FROM raised_at AT TIME ZONE 'Asia/Kolkata') = ${year}`
  );
  const cnt = Number((result as any).rows?.[0]?.cnt ?? 0);
  return `HLD-${year}-${String(cnt + 1).padStart(3, "0")}`;
}

async function fetchControl(id: number) {
  const [c] = await db.select().from(oiEnforcementControls).where(eq(oiEnforcementControls.id, id)).limit(1);
  return c ?? null;
}
async function fetchHold(id: number) {
  const [h] = await db.select().from(oiEnforcementHolds).where(eq(oiEnforcementHolds.id, id)).limit(1);
  return h ?? null;
}
async function lookupUserRole(userId: number): Promise<string | null> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.role ?? null;
}

function validateScope(
  scope: string,
  scopeProjectId: number | null | undefined,
  scopeEquipmentType: string | null | undefined,
): string | null {
  if (scope === "project") {
    if (!scopeProjectId) return "scope_field_required";
    if (scopeEquipmentType) return "scope_field_must_be_null";
  } else if (scope === "equipment_type") {
    if (!scopeEquipmentType || scopeEquipmentType.trim().length < 2) return "scope_field_required";
    if (scopeProjectId) return "scope_field_must_be_null";
  } else {
    if (scopeProjectId || scopeEquipmentType) return "scope_field_must_be_null";
  }
  return null;
}

async function determinePrimary(
  controlId: number, erpEntityType: string, erpEntityId: number, newScope: string,
): Promise<boolean> {
  const precedence: Record<string, number> = { project: 4, department: 3, equipment_type: 2, global: 1 };
  const newPrio = precedence[newScope] ?? 1;
  const existing = await db
    .select({ enforcementScope: oiEnforcementHolds.enforcementScope })
    .from(oiEnforcementHolds)
    .where(and(
      eq(oiEnforcementHolds.erpEntityType, erpEntityType),
      eq(oiEnforcementHolds.erpEntityId, erpEntityId),
      eq(oiEnforcementHolds.status, "open"),
    ));
  const maxExisting = existing.reduce((m, h) => Math.max(m, precedence[h.enforcementScope] ?? 1), 0);
  if (newPrio > maxExisting) {
    await db.update(oiEnforcementHolds)
      .set({ isPrimaryHold: false })
      .where(and(
        eq(oiEnforcementHolds.erpEntityType, erpEntityType),
        eq(oiEnforcementHolds.erpEntityId, erpEntityId),
        eq(oiEnforcementHolds.isPrimaryHold, true),
      ));
    return true;
  }
  return false;
}

async function lookupErpEntityRef(erpEntityType: string, erpEntityId: number): Promise<string | null> {
  try {
    if (erpEntityType === "epc_purchase_order" || erpEntityType === "purchase_order") {
      const r = await db.execute(sql`SELECT po_number FROM purchase_orders WHERE id = ${erpEntityId} LIMIT 1`);
      const row = (r as any).rows?.[0];
      return row ? (row.po_number ?? String(erpEntityId)) : null;
    }
    if (erpEntityType === "epc_work_order" || erpEntityType === "work_order") {
      const r = await db.execute(sql`SELECT wo_number FROM work_orders WHERE id = ${erpEntityId} LIMIT 1`);
      const row = (r as any).rows?.[0];
      return row ? (row.wo_number ?? String(erpEntityId)) : null;
    }
    if (erpEntityType === "epc_dispatch_readiness") {
      const r = await db.execute(sql`SELECT dispatch_number FROM dispatch_records WHERE id = ${erpEntityId} LIMIT 1`);
      const row = (r as any).rows?.[0];
      return row ? (row.dispatch_number ?? String(erpEntityId)) : null;
    }
    // Generic fallback — accept any valid positive integer as ref
    if (erpEntityId > 0) return String(erpEntityId);
    return null;
  } catch {
    // If the entity table doesn't exist yet, accept the ID as ref
    if (erpEntityId > 0) return String(erpEntityId);
    return null;
  }
}

// ─── 1. Controls ─────────────────────────────────────────────────────────────

// POST /enforcement/controls
oiEnforcementRouter.post("/enforcement/controls", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

    const {
      sopId, erpEntityType, controlType, enforcementLevel = "advisory",
      enforcementScope = "global", scopeProjectId, scopeEquipmentType,
      title, description, rationale, department, processArea,
      ownerId, approverId,
    } = req.body;

    if (!sopId || !erpEntityType || !controlType || !title || !description || !rationale || !department || !ownerId || !approverId)
      return res.status(422).json({ error: "missing_required_fields" });
    if (!VALID_ERP_ENTITY_TYPES.includes(erpEntityType)) return res.status(422).json({ error: "invalid_erp_entity_type" });
    if (!VALID_CONTROL_TYPES.includes(controlType)) return res.status(422).json({ error: "invalid_control_type" });
    if (!VALID_ENFORCEMENT_LEVELS.includes(enforcementLevel)) return res.status(422).json({ error: "invalid_enforcement_level" });
    if (!VALID_ENFORCEMENT_SCOPES.includes(enforcementScope)) return res.status(422).json({ error: "invalid_enforcement_scope" });
    if (!_validDeptsEnf.has(department)) return res.status(422).json({ error: "invalid_department" });
    if (title.length < 5) return res.status(422).json({ error: "title_too_short" });
    if (description.length < 10) return res.status(422).json({ error: "description_too_short" });
    if (rationale.length < 10) return res.status(422).json({ error: "rationale_too_short" });
    if (ownerId === approverId) return res.status(422).json({ error: "approver_must_differ_from_owner" });

    const scopeErr = validateScope(enforcementScope, scopeProjectId, scopeEquipmentType);
    if (scopeErr) return res.status(422).json({ error: scopeErr });

    const [sop] = await db.select({ id: oiSopRecords.id, status: oiSopRecords.status, revisionNumber: oiSopRecords.revisionNumber })
      .from(oiSopRecords).where(eq(oiSopRecords.id, sopId)).limit(1);
    if (!sop) return res.status(404).json({ error: "sop_not_found" });
    if (sop.status !== "active") return res.status(422).json({ error: "sop_not_active" });

    const controlNumber = await nextControlNumber();
    const [ctrl] = await db.insert(oiEnforcementControls).values({
      controlNumber, sopId, sopRevisionNumber: sop.revisionNumber,
      erpEntityType, controlType, enforcementLevel, enforcementScope,
      scopeProjectId: scopeProjectId ?? null, scopeEquipmentType: scopeEquipmentType ?? null,
      title, description, rationale, department, processArea: processArea ?? null,
      status: "draft", ownerId, approverId, createdBy: a.id,
    }).returning();

    await writeEnforcementAuditLog({
      controlId: ctrl.id, action: "enforcement_control_created",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      context: ctrl.controlNumber, ipAddress: a.ip,
    });
    return res.status(201).json(ctrl);
  } catch (err: any) {
    console.error("[Enforcement] POST /controls:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/controls
oiEnforcementRouter.get("/enforcement/controls", async (req, res) => {
  try {
    const { status, erp_entity_type, control_type, department, sop_id, enforcement_scope } = req.query as Record<string, string>;
    const filters: any[] = [];
    if (status) filters.push(eq(oiEnforcementControls.status, status));
    if (erp_entity_type) filters.push(eq(oiEnforcementControls.erpEntityType, erp_entity_type));
    if (control_type) filters.push(eq(oiEnforcementControls.controlType, control_type));
    if (department) filters.push(eq(oiEnforcementControls.department, department));
    if (sop_id) filters.push(eq(oiEnforcementControls.sopId, parseInt(sop_id)));
    if (enforcement_scope) filters.push(eq(oiEnforcementControls.enforcementScope, enforcement_scope));

    const controls = await db.select().from(oiEnforcementControls)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(oiEnforcementControls.createdAt));

    const ids = controls.map(c => c.id);
    const holdCounts = ids.length
      ? await db.select({ controlId: oiEnforcementHolds.controlId, cnt: count(oiEnforcementHolds.id) })
          .from(oiEnforcementHolds)
          .where(and(inArray(oiEnforcementHolds.controlId, ids), eq(oiEnforcementHolds.status, "open")))
          .groupBy(oiEnforcementHolds.controlId)
      : [];
    const holdMap = Object.fromEntries(holdCounts.map(h => [h.controlId, Number(h.cnt)]));

    return res.json(controls.map(c => ({ ...c, openHoldCount: holdMap[c.id] ?? 0 })));
  } catch (err) {
    console.error("[Enforcement] GET /controls:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/controls/:controlId
oiEnforcementRouter.get("/enforcement/controls/:controlId", async (req, res) => {
  try {
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });

    const [sop] = await db
      .select({ id: oiSopRecords.id, sopNumber: oiSopRecords.sopNumber, title: oiSopRecords.title, status: oiSopRecords.status, revisionNumber: oiSopRecords.revisionNumber, department: oiSopRecords.department })
      .from(oiSopRecords).where(eq(oiSopRecords.id, ctrl.sopId)).limit(1);

    const [holdCountRow] = await db.select({ cnt: count(oiEnforcementHolds.id) })
      .from(oiEnforcementHolds)
      .where(and(eq(oiEnforcementHolds.controlId, ctrl.id), eq(oiEnforcementHolds.status, "open")));

    return res.json({ ...ctrl, sop: sop ?? null, openHoldCount: Number(holdCountRow?.cnt ?? 0) });
  } catch (err) {
    console.error("[Enforcement] GET /controls/:id:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// PATCH /enforcement/controls/:controlId
oiEnforcementRouter.patch("/enforcement/controls/:controlId", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });
    if (ctrl.status !== "draft" && ctrl.status !== "suspended") return res.status(422).json({ error: "control_not_editable" });

    const data = req.body;
    const updates: Record<string, any> = {};
    const EDITABLE = ["title","description","rationale","enforcementLevel","enforcementScope","scopeProjectId",
      "scopeEquipmentType","department","processArea","ownerId","approverId","controlType","erpEntityType"];
    for (const key of Object.keys(data)) {
      if (EDITABLE.includes(key)) (updates as any)[key] = data[key];
    }

    const newOwner  = updates.ownerId   ?? ctrl.ownerId;
    const newApprover = updates.approverId ?? ctrl.approverId;
    if (newOwner === newApprover) return res.status(422).json({ error: "approver_must_differ_from_owner" });

    const scopeErr = validateScope(
      updates.enforcementScope  ?? ctrl.enforcementScope,
      updates.scopeProjectId    ?? ctrl.scopeProjectId,
      updates.scopeEquipmentType ?? ctrl.scopeEquipmentType,
    );
    if (scopeErr) return res.status(422).json({ error: scopeErr });

    updates.updatedAt = new Date();
    const [updated] = await db.update(oiEnforcementControls).set(updates)
      .where(eq(oiEnforcementControls.id, ctrl.id)).returning();

    await writeEnforcementAuditLog({
      controlId: ctrl.id, action: "field_updated",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      context: ctrl.controlNumber, ipAddress: a.ip,
    });
    return res.json(updated);
  } catch (err) {
    console.error("[Enforcement] PATCH /controls/:id:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/controls/:controlId/transition
oiEnforcementRouter.post("/enforcement/controls/:controlId/transition", async (req, res) => {
  try {
    const a = actor(req);
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });
    const { action, suspensionReason, retirementReason } = req.body;

    if (action === "activate") {
      if (!hasRole(a.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
      if (ctrl.status !== "draft" && ctrl.status !== "suspended") return res.status(422).json({ error: "invalid_transition" });
      if (!hasRole(a.role, SUPERUSER_ROLES) && a.id !== ctrl.approverId)
        return res.status(403).json({ error: "must_be_designated_approver_or_superuser" });

      const [sop] = await db.select({ status: oiSopRecords.status })
        .from(oiSopRecords).where(eq(oiSopRecords.id, ctrl.sopId)).limit(1);
      if (!sop || sop.status !== "active") return res.status(422).json({ error: "sop_not_active" });

      if (!ctrl.ownerId) return res.status(422).json({ error: "control_owner_not_assigned" });
      if (ctrl.ownerId === ctrl.approverId) return res.status(422).json({ error: "approver_must_differ_from_owner" });

      // Duplicate active control check
      await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'enf_activate_' + ctrl.sopId + '_' + ctrl.erpEntityType}))`);
      const dupConditions: any[] = [
        eq(oiEnforcementControls.status, "active"),
        eq(oiEnforcementControls.sopId, ctrl.sopId),
        eq(oiEnforcementControls.erpEntityType, ctrl.erpEntityType),
        eq(oiEnforcementControls.controlType, ctrl.controlType),
        eq(oiEnforcementControls.enforcementScope, ctrl.enforcementScope),
        ne(oiEnforcementControls.id, ctrl.id),
      ];
      if (ctrl.enforcementScope === "project" && ctrl.scopeProjectId)
        dupConditions.push(eq(oiEnforcementControls.scopeProjectId, ctrl.scopeProjectId));
      if (ctrl.enforcementScope === "equipment_type" && ctrl.scopeEquipmentType)
        dupConditions.push(eq(oiEnforcementControls.scopeEquipmentType, ctrl.scopeEquipmentType));

      const [dup] = await db.select({ controlNumber: oiEnforcementControls.controlNumber })
        .from(oiEnforcementControls).where(and(...dupConditions)).limit(1);
      if (dup) return res.status(409).json({ error: "duplicate_active_control", conflicting_control_number: dup.controlNumber });

      const now = new Date();
      const [updated] = await db.update(oiEnforcementControls)
        .set({ status: "active", approvedBy: a.id, approvedAt: now, suspendedBy: null, suspendedAt: null, suspensionReason: null, updatedAt: now })
        .where(eq(oiEnforcementControls.id, ctrl.id)).returning();

      await writeEnforcementAuditLog({
        controlId: ctrl.id, action: "enforcement_control_activated",
        actorId: a.id, actorName: a.name, actorRole: a.role,
        fieldName: "status", oldValue: ctrl.status, newValue: "active",
        context: ctrl.controlNumber, ipAddress: a.ip,
      });
      return res.json(updated);

    } else if (action === "suspend") {
      if (!hasRole(a.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
      if (ctrl.status !== "active") return res.status(422).json({ error: "invalid_transition" });
      if (!suspensionReason || suspensionReason.trim().length < 10) return res.status(422).json({ error: "suspension_reason_required" });

      const now = new Date();
      const [updated] = await db.update(oiEnforcementControls)
        .set({ status: "suspended", suspendedBy: a.id, suspendedAt: now, suspensionReason: suspensionReason.trim(), updatedAt: now })
        .where(eq(oiEnforcementControls.id, ctrl.id)).returning();

      await writeEnforcementAuditLog({
        controlId: ctrl.id, action: "enforcement_control_suspended",
        actorId: a.id, actorName: a.name, actorRole: a.role,
        fieldName: "status", oldValue: "active", newValue: "suspended",
        context: `${ctrl.controlNumber} reason=${suspensionReason.trim().slice(0, 80)}`, ipAddress: a.ip,
      });
      return res.json(updated);

    } else if (action === "retire") {
      if (!hasRole(a.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
      if (ctrl.status !== "active" && ctrl.status !== "suspended") return res.status(422).json({ error: "invalid_transition" });
      if (!retirementReason || retirementReason.trim().length < 10) return res.status(422).json({ error: "retirement_reason_required" });

      if (ctrl.status === "active") {
        const [openRow] = await db.select({ cnt: count(oiEnforcementHolds.id) })
          .from(oiEnforcementHolds)
          .where(and(eq(oiEnforcementHolds.controlId, ctrl.id), eq(oiEnforcementHolds.status, "open"), eq(oiEnforcementHolds.enforcementLevel, "mandatory")));
        if (Number(openRow.cnt) > 0) return res.status(422).json({ error: "open_mandatory_holds_exist", count: Number(openRow.cnt) });
      }

      const now = new Date();
      const [updated] = await db.update(oiEnforcementControls)
        .set({ status: "retired", retiredBy: a.id, retiredAt: now, retirementReason: retirementReason.trim(), updatedAt: now })
        .where(eq(oiEnforcementControls.id, ctrl.id)).returning();

      await writeEnforcementAuditLog({
        controlId: ctrl.id, action: "enforcement_control_retired",
        actorId: a.id, actorName: a.name, actorRole: a.role,
        fieldName: "status", oldValue: ctrl.status, newValue: "retired",
        context: `${ctrl.controlNumber} reason=${retirementReason.trim().slice(0, 80)}`, ipAddress: a.ip,
      });
      return res.json(updated);

    } else {
      return res.status(422).json({ error: "invalid_action" });
    }
  } catch (err) {
    console.error("[Enforcement] POST /controls/:id/transition:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/controls/:controlId/audit-log
oiEnforcementRouter.get("/enforcement/controls/:controlId/audit-log", async (req, res) => {
  try {
    const rows = await db.select().from(oiEnforcementAuditLog)
      .where(eq(oiEnforcementAuditLog.controlId, parseInt(req.params.controlId)))
      .orderBy(desc(oiEnforcementAuditLog.createdAt));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /sop/:sopId/enforcement-controls
oiEnforcementRouter.get("/sop/:sopId/enforcement-controls", async (req, res) => {
  try {
    const controls = await db.select().from(oiEnforcementControls)
      .where(eq(oiEnforcementControls.sopId, parseInt(req.params.sopId)))
      .orderBy(desc(oiEnforcementControls.createdAt));
    return res.json(controls);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/erp/:erpEntityType/controls
oiEnforcementRouter.get("/enforcement/erp/:erpEntityType/controls", async (req, res) => {
  try {
    const controls = await db.select().from(oiEnforcementControls)
      .where(and(
        eq(oiEnforcementControls.erpEntityType, req.params.erpEntityType),
        eq(oiEnforcementControls.status, "active"),
      )).orderBy(asc(oiEnforcementControls.controlNumber));
    return res.json(controls);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// ─── 2. Checklists ───────────────────────────────────────────────────────────

// POST /enforcement/controls/:controlId/checklist
oiEnforcementRouter.post("/enforcement/controls/:controlId/checklist", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });
    if (ctrl.status !== "draft") return res.status(422).json({ error: "control_not_draft" });

    const { title, description, isRequired = true, evidenceRequired = false, sortOrder = 0 } = req.body;
    if (!title || title.length < 5) return res.status(422).json({ error: "title_too_short" });

    const [maxRow] = await db.select({ max: sql<number>`COALESCE(MAX(item_number), 0)` })
      .from(oiEnforcementChecklists).where(eq(oiEnforcementChecklists.controlId, ctrl.id));
    const itemNumber = Number(maxRow?.max ?? 0) + 1;

    const [item] = await db.insert(oiEnforcementChecklists).values({
      controlId: ctrl.id, itemNumber, title,
      description: description ?? null,
      isRequired: evidenceRequired ? true : isRequired,
      evidenceRequired, sortOrder,
    }).returning();

    await db.update(oiEnforcementControls)
      .set({ controlChecklistVersion: ctrl.controlChecklistVersion + 1, updatedAt: new Date() })
      .where(eq(oiEnforcementControls.id, ctrl.id));

    return res.status(201).json(item);
  } catch (err) {
    console.error("[Enforcement] POST /checklist:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/controls/:controlId/checklist
oiEnforcementRouter.get("/enforcement/controls/:controlId/checklist", async (req, res) => {
  try {
    const items = await db.select().from(oiEnforcementChecklists)
      .where(eq(oiEnforcementChecklists.controlId, parseInt(req.params.controlId)))
      .orderBy(asc(oiEnforcementChecklists.sortOrder), asc(oiEnforcementChecklists.itemNumber));
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// PATCH /enforcement/controls/:controlId/checklist/:itemId
oiEnforcementRouter.patch("/enforcement/controls/:controlId/checklist/:itemId", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });
    if (ctrl.status !== "draft") return res.status(422).json({ error: "control_not_draft" });

    const [item] = await db.select().from(oiEnforcementChecklists)
      .where(and(eq(oiEnforcementChecklists.id, parseInt(req.params.itemId)), eq(oiEnforcementChecklists.controlId, ctrl.id))).limit(1);
    if (!item) return res.status(404).json({ error: "checklist_item_not_found" });

    const updates: any = { updatedAt: new Date() };
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.isRequired !== undefined) updates.isRequired = req.body.isRequired;
    if (req.body.evidenceRequired !== undefined) {
      updates.evidenceRequired = req.body.evidenceRequired;
      if (req.body.evidenceRequired) updates.isRequired = true;
    }
    if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;

    const [updated] = await db.update(oiEnforcementChecklists).set(updates)
      .where(eq(oiEnforcementChecklists.id, item.id)).returning();

    await db.update(oiEnforcementControls)
      .set({ controlChecklistVersion: ctrl.controlChecklistVersion + 1, updatedAt: new Date() })
      .where(eq(oiEnforcementControls.id, ctrl.id));

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// DELETE /enforcement/controls/:controlId/checklist/:itemId
oiEnforcementRouter.delete("/enforcement/controls/:controlId/checklist/:itemId", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const ctrl = await fetchControl(parseInt(req.params.controlId));
    if (!ctrl) return res.status(404).json({ error: "not_found" });
    if (ctrl.status !== "draft") return res.status(422).json({ error: "control_not_draft" });

    await db.delete(oiEnforcementChecklists)
      .where(and(eq(oiEnforcementChecklists.id, parseInt(req.params.itemId)), eq(oiEnforcementChecklists.controlId, ctrl.id)));

    await db.update(oiEnforcementControls)
      .set({ controlChecklistVersion: ctrl.controlChecklistVersion + 1, updatedAt: new Date() })
      .where(eq(oiEnforcementControls.id, ctrl.id));

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// ─── 3. Holds ─────────────────────────────────────────────────────────────────

// POST /enforcement/holds
oiEnforcementRouter.post("/enforcement/holds", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });

    const { controlId, erpEntityId, reason, holdOwnerId, responsibleDepartment, escalationOwnerId, holdApproverId } = req.body;
    if (!controlId || !erpEntityId || !reason) return res.status(422).json({ error: "missing_required_fields" });
    if (!reason || reason.trim().length < 10) return res.status(422).json({ error: "reason_too_short" });
    if (!holdOwnerId) return res.status(422).json({ error: "hold_owner_required" });
    if (!responsibleDepartment) return res.status(422).json({ error: "responsible_department_required" });
    if (!escalationOwnerId) return res.status(422).json({ error: "escalation_owner_required" });

    const ctrl = await fetchControl(controlId);
    if (!ctrl) return res.status(404).json({ error: "control_not_found" });
    if (ctrl.status !== "active") return res.status(422).json({ error: "control_not_active" });

    const escRole = await lookupUserRole(escalationOwnerId);
    if (!escRole || !hasRole(escRole, SM_ROLES)) return res.status(422).json({ error: "escalation_owner_must_be_sm_plus" });

    const erpEntityRef = await lookupErpEntityRef(ctrl.erpEntityType, erpEntityId);
    if (erpEntityRef === null) return res.status(404).json({ error: "erp_entity_not_found" });

    const isPrimary = await determinePrimary(controlId, ctrl.erpEntityType, erpEntityId, ctrl.enforcementScope);

    const holdNumber = await nextHoldNumber();
    const now = new Date();
    const [hold] = await db.insert(oiEnforcementHolds).values({
      holdNumber, controlId,
      erpEntityType: ctrl.erpEntityType, erpEntityId, erpEntityRef,
      enforcementLevel: ctrl.enforcementLevel,
      holdType: ctrl.controlType, enforcementScope: ctrl.enforcementScope,
      isPrimaryHold: isPrimary, reason: reason.trim(), status: "open",
      holdOwnerId, responsibleDepartment, escalationOwnerId,
      holdApproverId: holdApproverId ?? null, raisedBy: a.id, raisedAt: now,
    }).returning();

    const checklistItems = await db.select().from(oiEnforcementChecklists)
      .where(eq(oiEnforcementChecklists.controlId, controlId));
    if (checklistItems.length > 0) {
      await db.insert(oiEnforcementChecklistResponses).values(
        checklistItems.map(item => ({
          holdId: hold.id, checklistItemId: item.id,
          sopRevisionNumber: ctrl.sopRevisionNumber,
          checklistRevisionNumber: ctrl.controlChecklistVersion,
          responseStatus: "pending" as const, isChecked: false,
        }))
      );
    }

    await writeEnforcementAuditLog({
      controlId, holdId: hold.id, action: "enforcement_hold_raised",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      context: `${holdNumber} on ${ctrl.erpEntityType}:${erpEntityRef}`, ipAddress: a.ip,
    });
    return res.status(201).json(hold);
  } catch (err: any) {
    console.error("[Enforcement] POST /holds:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/holds
oiEnforcementRouter.get("/enforcement/holds", async (req, res) => {
  try {
    const { status, control_id, erp_entity_type, hold_type, enforcement_level, responsible_department } = req.query as Record<string, string>;
    const filters: any[] = [];
    if (status) filters.push(eq(oiEnforcementHolds.status, status));
    if (control_id) filters.push(eq(oiEnforcementHolds.controlId, parseInt(control_id)));
    if (erp_entity_type) filters.push(eq(oiEnforcementHolds.erpEntityType, erp_entity_type));
    if (hold_type) filters.push(eq(oiEnforcementHolds.holdType, hold_type));
    if (enforcement_level) filters.push(eq(oiEnforcementHolds.enforcementLevel, enforcement_level));
    if (responsible_department) filters.push(eq(oiEnforcementHolds.responsibleDepartment, responsible_department));

    const holds = await db.select().from(oiEnforcementHolds)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(oiEnforcementHolds.raisedAt));
    return res.json(holds);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/holds/:holdId
oiEnforcementRouter.get("/enforcement/holds/:holdId", async (req, res) => {
  try {
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    const ctrl = await fetchControl(hold.controlId);

    let emergencyBypass = null;
    if (hold.status === "emergency_bypassed" && hold.bypassBy) {
      const [bypassUser] = await db.select({ name: users.name, username: users.username })
        .from(users).where(eq(users.id, hold.bypassBy)).limit(1);
      emergencyBypass = {
        bypass_by_name: bypassUser ? (bypassUser.name || bypassUser.username) : "Unknown",
        bypass_at: hold.bypassAt, bypass_reason: hold.bypassReason,
      };
    }
    return res.json({ ...hold, control: ctrl, emergency_bypass: emergencyBypass });
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// PATCH /enforcement/holds/:holdId
oiEnforcementRouter.patch("/enforcement/holds/:holdId", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open") return res.status(422).json({ error: "hold_not_open" });

    const updates: any = { updatedAt: new Date() };
    if (req.body.holdApproverId  !== undefined) updates.holdApproverId = req.body.holdApproverId;
    if (req.body.holdOwnerId     !== undefined) updates.holdOwnerId = req.body.holdOwnerId;
    if (req.body.responsibleDepartment !== undefined) updates.responsibleDepartment = req.body.responsibleDepartment;
    if (req.body.escalationOwnerId !== undefined) {
      const escRole = await lookupUserRole(req.body.escalationOwnerId);
      if (!escRole || !hasRole(escRole, SM_ROLES)) return res.status(422).json({ error: "escalation_owner_must_be_sm_plus" });
      updates.escalationOwnerId = req.body.escalationOwnerId;
    }

    const [updated] = await db.update(oiEnforcementHolds).set(updates)
      .where(eq(oiEnforcementHolds.id, hold.id)).returning();
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/approve
oiEnforcementRouter.post("/enforcement/holds/:holdId/approve", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open") return res.status(422).json({ error: "hold_not_open" });
    if (hold.enforcementLevel !== "mandatory") return res.status(422).json({ error: "advisory_hold_cannot_approve_to_proceed" });

    const { note } = req.body;
    if (!note || note.trim().length < 10) return res.status(422).json({ error: "approved_to_proceed_note_required" });

    const now = new Date();
    const [updated] = await db.update(oiEnforcementHolds)
      .set({ status: "approved_to_proceed", approvedToProceedBy: a.id, approvedToProceedAt: now, approvedToProceedNote: note.trim(), updatedAt: now })
      .where(eq(oiEnforcementHolds.id, hold.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_hold_approved_to_proceed",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "status", oldValue: "open", newValue: "approved_to_proceed",
      context: hold.holdNumber, ipAddress: a.ip,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/release
oiEnforcementRouter.post("/enforcement/holds/:holdId/release", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed")
      return res.status(422).json({ error: "invalid_hold_status_for_release" });

    const { releaseNote } = req.body;
    if (!releaseNote || releaseNote.trim().length < 10) return res.status(422).json({ error: "release_note_required" });
    if (!hold.holdApproverId) return res.status(422).json({ error: "hold_approver_not_assigned" });

    const responses = await db.select({
      id: oiEnforcementChecklistResponses.id,
      isChecked: oiEnforcementChecklistResponses.isChecked,
      responseStatus: oiEnforcementChecklistResponses.responseStatus,
      evidenceNote: oiEnforcementChecklistResponses.evidenceNote,
      checklistItemId: oiEnforcementChecklistResponses.checklistItemId,
    }).from(oiEnforcementChecklistResponses).where(eq(oiEnforcementChecklistResponses.holdId, hold.id));

    const checklistItems = await db.select({ id: oiEnforcementChecklists.id, isRequired: oiEnforcementChecklists.isRequired, evidenceRequired: oiEnforcementChecklists.evidenceRequired })
      .from(oiEnforcementChecklists)
      .where(inArray(oiEnforcementChecklists.id, responses.map(r => r.checklistItemId)));
    const itemMap = Object.fromEntries(checklistItems.map(i => [i.id, i]));

    const incompleteItems: number[] = [];
    const missingEvidence: number[] = [];
    for (const resp of responses) {
      const item = itemMap[resp.checklistItemId];
      if (!item) continue;
      if (item.isRequired && resp.responseStatus !== "submitted") incompleteItems.push(resp.checklistItemId);
      if (item.isRequired && item.evidenceRequired && (!resp.evidenceNote || !resp.evidenceNote.trim())) missingEvidence.push(resp.checklistItemId);
    }
    if (incompleteItems.length) return res.status(422).json({ error: "checklist_incomplete", incompleteItems });
    if (missingEvidence.length) return res.status(422).json({ error: "checklist_evidence_incomplete", missingEvidence });

    const now = new Date();
    const [updated] = await db.update(oiEnforcementHolds)
      .set({ status: "released", releasedBy: a.id, releasedAt: now, releaseNote: releaseNote.trim(), updatedAt: now })
      .where(eq(oiEnforcementHolds.id, hold.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_hold_released",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "status", oldValue: hold.status, newValue: "released",
      context: hold.holdNumber, ipAddress: a.ip,
    });
    return res.json(updated);
  } catch (err) {
    console.error("[Enforcement] POST /holds/:id/release:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/override
oiEnforcementRouter.post("/enforcement/holds/:holdId/override", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed")
      return res.status(422).json({ error: "invalid_hold_status_for_override" });

    const { overrideReason } = req.body;
    if (!overrideReason || overrideReason.trim().length < 20) return res.status(422).json({ error: "override_reason_required" });

    const now = new Date();
    const [updated] = await db.update(oiEnforcementHolds)
      .set({ status: "overridden", overrideBy: a.id, overrideAt: now, overrideReason: overrideReason.trim(), updatedAt: now })
      .where(eq(oiEnforcementHolds.id, hold.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_hold_overridden",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "status", oldValue: hold.status, newValue: "overridden",
      context: `${hold.holdNumber} reason=${overrideReason.trim().slice(0, 80)}`, ipAddress: a.ip,
      isOverrideEvent: true,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/emergency-bypass
oiEnforcementRouter.post("/enforcement/holds/:holdId/emergency-bypass", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, SUPERUSER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed")
      return res.status(422).json({ error: "invalid_hold_status_for_bypass" });

    const { bypassReason } = req.body;
    if (!bypassReason || bypassReason.trim().length < 20) return res.status(422).json({ error: "bypass_reason_required" });

    const now = new Date();
    const [updated] = await db.update(oiEnforcementHolds)
      .set({ status: "emergency_bypassed", bypassBy: a.id, bypassAt: now, bypassReason: bypassReason.trim(), updatedAt: now })
      .where(eq(oiEnforcementHolds.id, hold.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_hold_emergency_bypassed",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "status", oldValue: hold.status, newValue: "emergency_bypassed",
      context: `${hold.holdNumber} EMERGENCY-BYPASS reason=${bypassReason.trim().slice(0, 80)}`, ipAddress: a.ip,
      isOverrideEvent: true,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/holds/:holdId/audit-log
oiEnforcementRouter.get("/enforcement/holds/:holdId/audit-log", async (req, res) => {
  try {
    const rows = await db.select().from(oiEnforcementAuditLog)
      .where(eq(oiEnforcementAuditLog.holdId, parseInt(req.params.holdId)))
      .orderBy(desc(oiEnforcementAuditLog.createdAt));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/erp/:erpEntityType/:erpEntityId/holds
oiEnforcementRouter.get("/enforcement/erp/:erpEntityType/:erpEntityId/holds", async (req, res) => {
  try {
    const { status, enforcement_level } = req.query as Record<string, string>;
    const filters: any[] = [
      eq(oiEnforcementHolds.erpEntityType, req.params.erpEntityType),
      eq(oiEnforcementHolds.erpEntityId, parseInt(req.params.erpEntityId)),
    ];
    if (status) filters.push(eq(oiEnforcementHolds.status, status));
    if (enforcement_level) filters.push(eq(oiEnforcementHolds.enforcementLevel, enforcement_level));

    const holds = await db.select().from(oiEnforcementHolds)
      .where(and(...filters)).orderBy(desc(oiEnforcementHolds.raisedAt));
    return res.json(holds);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /enforcement/holds/:holdId/checklist-responses
oiEnforcementRouter.get("/enforcement/holds/:holdId/checklist-responses", async (req, res) => {
  try {
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });

    const responses = await db.select().from(oiEnforcementChecklistResponses)
      .where(eq(oiEnforcementChecklistResponses.holdId, hold.id))
      .orderBy(asc(oiEnforcementChecklistResponses.checklistItemId));
    return res.json(responses);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/checklist-responses
oiEnforcementRouter.post("/enforcement/holds/:holdId/checklist-responses", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed") return res.status(422).json({ error: "hold_not_open" });

    const { responses } = req.body;
    if (!Array.isArray(responses)) return res.status(422).json({ error: "responses_must_be_array" });

    const now = new Date();
    const results = [];

    for (const resp of responses) {
      const [existing] = await db.select().from(oiEnforcementChecklistResponses)
        .where(and(
          eq(oiEnforcementChecklistResponses.holdId, hold.id),
          eq(oiEnforcementChecklistResponses.checklistItemId, resp.checklistItemId),
        )).limit(1);
      if (!existing) continue;

      if (existing.responseStatus === "submitted") {
        return res.status(422).json({ error: "response_immutable_after_submission", checklistItemId: resp.checklistItemId });
      }

      const [item] = await db.select({ evidenceRequired: oiEnforcementChecklists.evidenceRequired })
        .from(oiEnforcementChecklists).where(eq(oiEnforcementChecklists.id, resp.checklistItemId)).limit(1);
      if (item?.evidenceRequired && (!resp.evidenceNote || !resp.evidenceNote.trim())) {
        return res.status(422).json({ error: "evidence_note_required", checklistItemId: resp.checklistItemId });
      }

      const [updated] = await db.update(oiEnforcementChecklistResponses)
        .set({ isChecked: true, responseStatus: "submitted", evidenceNote: resp.evidenceNote ?? null, respondedBy: a.id, respondedAt: now, updatedAt: now })
        .where(eq(oiEnforcementChecklistResponses.id, existing.id)).returning();
      results.push(updated);

      await writeEnforcementAuditLog({
        controlId: hold.controlId, holdId: hold.id, action: "enforcement_checklist_item_checked",
        actorId: a.id, actorName: a.name, actorRole: a.role,
        fieldName: "checklist_item_id", newValue: String(resp.checklistItemId),
        context: `${hold.holdNumber} item #${resp.checklistItemId}`, ipAddress: a.ip,
      });
    }
    return res.json(results);
  } catch (err) {
    console.error("[Enforcement] POST /checklist-responses:", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/checklist-responses/:responseId/reject
oiEnforcementRouter.post("/enforcement/holds/:holdId/checklist-responses/:responseId/reject", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed") return res.status(422).json({ error: "hold_not_open" });

    const [resp] = await db.select().from(oiEnforcementChecklistResponses)
      .where(and(
        eq(oiEnforcementChecklistResponses.id, parseInt(req.params.responseId)),
        eq(oiEnforcementChecklistResponses.holdId, hold.id),
      )).limit(1);
    if (!resp) return res.status(404).json({ error: "response_not_found" });
    if (resp.responseStatus !== "submitted") return res.status(422).json({ error: "only_submitted_responses_can_be_rejected" });

    const { rejectionReason } = req.body;
    if (!rejectionReason || rejectionReason.trim().length < 10) return res.status(422).json({ error: "rejection_reason_required" });

    const now = new Date();
    const [updated] = await db.update(oiEnforcementChecklistResponses)
      .set({ responseStatus: "rejected", isChecked: false, rejectionReason: rejectionReason.trim(), rejectedBy: a.id, rejectedAt: now, updatedAt: now })
      .where(eq(oiEnforcementChecklistResponses.id, resp.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_checklist_item_rejected",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "checklist_item_id", newValue: String(resp.checklistItemId),
      context: `${hold.holdNumber} reject reason=${rejectionReason.trim().slice(0, 80)}`, ipAddress: a.ip,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// POST /enforcement/holds/:holdId/checklist-responses/:responseId/resubmit
oiEnforcementRouter.post("/enforcement/holds/:holdId/checklist-responses/:responseId/resubmit", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
    const hold = await fetchHold(parseInt(req.params.holdId));
    if (!hold) return res.status(404).json({ error: "not_found" });
    if (hold.status !== "open" && hold.status !== "approved_to_proceed") return res.status(422).json({ error: "hold_not_open" });

    const [resp] = await db.select().from(oiEnforcementChecklistResponses)
      .where(and(
        eq(oiEnforcementChecklistResponses.id, parseInt(req.params.responseId)),
        eq(oiEnforcementChecklistResponses.holdId, hold.id),
      )).limit(1);
    if (!resp) return res.status(404).json({ error: "response_not_found" });
    if (resp.responseStatus !== "rejected") return res.status(422).json({ error: "only_rejected_responses_can_be_resubmitted" });

    const { evidenceNote } = req.body;
    const [item] = await db.select({ evidenceRequired: oiEnforcementChecklists.evidenceRequired })
      .from(oiEnforcementChecklists).where(eq(oiEnforcementChecklists.id, resp.checklistItemId)).limit(1);
    if (item?.evidenceRequired && (!evidenceNote || !evidenceNote.trim())) {
      return res.status(422).json({ error: "evidence_note_required" });
    }

    const now = new Date();
    const [updated] = await db.update(oiEnforcementChecklistResponses)
      .set({ isChecked: true, responseStatus: "submitted", evidenceNote: evidenceNote ?? resp.evidenceNote, rejectionReason: null, rejectedBy: null, rejectedAt: null, respondedBy: a.id, respondedAt: now, updatedAt: now })
      .where(eq(oiEnforcementChecklistResponses.id, resp.id)).returning();

    await writeEnforcementAuditLog({
      controlId: hold.controlId, holdId: hold.id, action: "enforcement_checklist_item_resubmitted",
      actorId: a.id, actorName: a.name, actorRole: a.role,
      fieldName: "checklist_item_id", newValue: String(resp.checklistItemId),
      context: `${hold.holdNumber} resubmit item #${resp.checklistItemId}`, ipAddress: a.ip,
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// ─── 4. Dashboard endpoints ───────────────────────────────────────────────────

// GET /dashboard/enforcement-summary
oiEnforcementRouter.get("/dashboard/enforcement-summary", async (req, res) => {
  try {
    const [controls] = await db.select({
      total:     count(oiEnforcementControls.id),
      active:    sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      draft:     sql<number>`COUNT(*) FILTER (WHERE status = 'draft')`,
      suspended: sql<number>`COUNT(*) FILTER (WHERE status = 'suspended')`,
      retired:   sql<number>`COUNT(*) FILTER (WHERE status = 'retired')`,
    }).from(oiEnforcementControls);

    const [holds] = await db.select({
      total:             count(oiEnforcementHolds.id),
      open:              sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
      approvedToProceed: sql<number>`COUNT(*) FILTER (WHERE status = 'approved_to_proceed')`,
      released:          sql<number>`COUNT(*) FILTER (WHERE status = 'released')`,
      overridden:        sql<number>`COUNT(*) FILTER (WHERE status = 'overridden')`,
      emergencyBypassed: sql<number>`COUNT(*) FILTER (WHERE status = 'emergency_bypassed')`,
      mandatory:         sql<number>`COUNT(*) FILTER (WHERE enforcement_level = 'mandatory' AND status = 'open')`,
    }).from(oiEnforcementHolds);

    return res.json({ controls, holds });
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /dashboard/enforcement-by-type
oiEnforcementRouter.get("/dashboard/enforcement-by-type", async (req, res) => {
  try {
    const rows = await db.select({
      controlType: oiEnforcementHolds.holdType,
      total:    count(oiEnforcementHolds.id),
      open:     sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
      released: sql<number>`COUNT(*) FILTER (WHERE status = 'released')`,
    }).from(oiEnforcementHolds)
      .groupBy(oiEnforcementHolds.holdType)
      .orderBy(desc(count(oiEnforcementHolds.id)));
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /dashboard/enforcement-overrides
oiEnforcementRouter.get("/dashboard/enforcement-overrides", async (req, res) => {
  try {
    const periodDays = parseInt(String(req.query.periodDays ?? "90"));
    const rows = await db.select({
      id:             oiEnforcementAuditLog.id,
      holdId:         oiEnforcementAuditLog.holdId,
      controlId:      oiEnforcementAuditLog.controlId,
      action:         oiEnforcementAuditLog.action,
      actorId:        oiEnforcementAuditLog.actorId,
      actorName:      oiEnforcementAuditLog.actorName,
      actorRole:      oiEnforcementAuditLog.actorRole,
      context:        oiEnforcementAuditLog.context,
      createdAt:      oiEnforcementAuditLog.createdAt,
    }).from(oiEnforcementAuditLog)
      .where(and(
        eq(oiEnforcementAuditLog.isOverrideEvent, true),
        sql`${oiEnforcementAuditLog.createdAt} >= NOW() - INTERVAL '${sql.raw(String(periodDays))} days'`,
      ))
      .orderBy(desc(oiEnforcementAuditLog.createdAt))
      .limit(50);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});

// GET /dashboard/enforcement-kpi (SM+ only)
oiEnforcementRouter.get("/dashboard/enforcement-kpi", async (req, res) => {
  try {
    const a = actor(req);
    if (!hasRole(a.role, SM_ROLES)) return res.status(403).json({ error: "forbidden" });

    const periodDays = parseInt(String(req.query.periodDays ?? "90"));

    const [holdStats] = await db.select({
      totalRaised:    count(oiEnforcementHolds.id),
      totalReleased:  sql<number>`COUNT(*) FILTER (WHERE status = 'released')`,
      totalOverridden: sql<number>`COUNT(*) FILTER (WHERE status = 'overridden')`,
      totalBypassed:  sql<number>`COUNT(*) FILTER (WHERE status = 'emergency_bypassed')`,
      openMandatory:  sql<number>`COUNT(*) FILTER (WHERE status = 'open' AND enforcement_level = 'mandatory')`,
      openAdvisory:   sql<number>`COUNT(*) FILTER (WHERE status = 'open' AND enforcement_level = 'advisory')`,
    }).from(oiEnforcementHolds)
      .where(sql`${oiEnforcementHolds.raisedAt} >= NOW() - INTERVAL '${sql.raw(String(periodDays))} days'`);

    const [overrideStats] = await db.select({
      totalOverrideEvents: count(oiEnforcementAuditLog.id),
    }).from(oiEnforcementAuditLog)
      .where(and(
        eq(oiEnforcementAuditLog.isOverrideEvent, true),
        sql`${oiEnforcementAuditLog.createdAt} >= NOW() - INTERVAL '${sql.raw(String(periodDays))} days'`,
      ));

    const byDept = await db.select({
      department: oiEnforcementHolds.responsibleDepartment,
      open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
      released: sql<number>`COUNT(*) FILTER (WHERE status = 'released')`,
    }).from(oiEnforcementHolds)
      .where(sql`${oiEnforcementHolds.raisedAt} >= NOW() - INTERVAL '${sql.raw(String(periodDays))} days'`)
      .groupBy(oiEnforcementHolds.responsibleDepartment)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE status = 'open')`))
      .limit(10);

    return res.json({ holdStats, overrideStats, byDepartment: byDept, periodDays });
  } catch (err) {
    return res.status(500).json({ error: "internal_server_error" });
  }
});
