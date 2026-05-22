import { db } from "./db";
import { oiSopAuditLog } from "@shared/schema";

export async function writeSopAuditLog(data: {
  sopId: number | null;
  action: typeof oiSopAuditLog.$inferInsert["action"];
  actorId: number;
  actorName: string;
  actorRole: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  context?: string;
  ipAddress?: string;
}) {
  try {
    await db.insert(oiSopAuditLog).values({
      sopId:     data.sopId,
      action:    data.action,
      actorId:   data.actorId,
      actorName: data.actorName,
      actorRole: data.actorRole,
      fieldName: data.fieldName ?? null,
      oldValue:  data.oldValue ?? null,
      newValue:  data.newValue ?? null,
      context:   data.context ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[SOP Audit] Failed to write audit log:", err);
  }
}
