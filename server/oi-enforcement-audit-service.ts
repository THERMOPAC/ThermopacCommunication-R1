import { db } from "./db";
import { oiEnforcementAuditLog } from "@shared/schema";

const OVERRIDE_ACTIONS = new Set([
  "enforcement_hold_overridden",
  "enforcement_hold_emergency_bypassed",
]);

export async function writeEnforcementAuditLog(data: {
  controlId?: number | null;
  holdId?: number | null;
  action: typeof oiEnforcementAuditLog.$inferInsert["action"];
  actorId: number;
  actorName: string;
  actorRole: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  context?: string;
  ipAddress?: string;
  isOverrideEvent?: boolean;
}) {
  if (!data.controlId && !data.holdId) {
    console.error("[Enforcement Audit] At least one of controlId or holdId must be non-null");
    return;
  }
  const isOverride = data.isOverrideEvent ?? OVERRIDE_ACTIONS.has(data.action);
  try {
    await db.insert(oiEnforcementAuditLog).values({
      controlId:       data.controlId   ?? null,
      holdId:          data.holdId      ?? null,
      action:          data.action,
      actorId:         data.actorId,
      actorName:       data.actorName,
      actorRole:       data.actorRole,
      fieldName:       data.fieldName   ?? null,
      oldValue:        data.oldValue    ?? null,
      newValue:        data.newValue    ?? null,
      context:         data.context     ?? null,
      ipAddress:       data.ipAddress   ?? null,
      isOverrideEvent: isOverride,
    });
  } catch (err) {
    console.error("[Enforcement Audit] Failed to write audit log:", err);
    throw err;
  }
}
