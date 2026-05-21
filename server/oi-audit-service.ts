import { db } from "./db";
import { oiAuditLog } from "@shared/schema";

export async function writeAuditLog(data: {
  issueId: number;
  action: typeof oiAuditLog.$inferInsert["action"];
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
    await db.insert(oiAuditLog).values({
      issueId: data.issueId,
      action: data.action,
      actorId: data.actorId,
      actorName: data.actorName,
      actorRole: data.actorRole,
      fieldName: data.fieldName ?? null,
      oldValue: data.oldValue ?? null,
      newValue: data.newValue ?? null,
      context: data.context ?? null,
      ipAddress: data.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[OI Audit] Failed to write audit log:", err);
  }
}
