import cron from "node-cron";
import { db } from "./db";
import { oiCapaRecords, oiCapaEscalationLog, users } from "@shared/schema";
import { and, eq, isNotNull, or, sql, inArray, not } from "drizzle-orm";
import { writeAuditLog } from "./oi-audit-service";

function computeIsOverdue(dueDate: Date | null, extendedDueDate: Date | null, status: string): boolean {
  const effective = extendedDueDate ?? dueDate;
  if (!effective) return false;
  if (status === 'closed' || status === 'cancelled') return false;
  return effective < new Date();
}

async function getRecipientUserIds(level: number, assignedTo: number | null): Promise<number[]> {
  const ids = new Set<number>();
  if (assignedTo) ids.add(assignedTo);

  if (level >= 2) {
    const managers = await db.select({ id: users.id })
      .from(users)
      .where(sql`${users.role} IN ('Manager','Senior Manager','General Manager','Superuser')`);
    managers.forEach(u => ids.add(u.id));
  }

  if (level >= 3) {
    const smUsers = await db.select({ id: users.id })
      .from(users)
      .where(sql`${users.role} IN ('Senior Manager','General Manager','Superuser')`);
    smUsers.forEach(u => ids.add(u.id));
  }

  return Array.from(ids);
}

export async function runCapaEscalation(): Promise<void> {
  try {
    const now = new Date();

    const capas = await db.select().from(oiCapaRecords)
      .where(
        and(
          not(inArray(oiCapaRecords.status, ['closed','cancelled'])),
          or(isNotNull(oiCapaRecords.dueDate), isNotNull(oiCapaRecords.extendedDueDate))
        )
      );

    let fired = 0;

    for (const capa of capas) {
      const effectiveDue = capa.extendedDueDate ?? capa.dueDate;
      if (!effectiveDue) continue;
      if (!computeIsOverdue(capa.dueDate, capa.extendedDueDate, capa.status)) continue;

      const overdueDays = Math.floor((now.getTime() - effectiveDue.getTime()) / 86400000);
      if (overdueDays < 1) continue;

      let targetLevel: number;
      if (overdueDays >= 14)      targetLevel = 3;
      else if (overdueDays >= 7)  targetLevel = 2;
      else                        targetLevel = 1;

      // Check if this level already fired
      const already = await db.select({ id: oiCapaEscalationLog.id })
        .from(oiCapaEscalationLog)
        .where(and(eq(oiCapaEscalationLog.capaId, capa.id), eq(oiCapaEscalationLog.level, targetLevel)))
        .limit(1);

      if (already.length) continue;

      const recipientUserIds = await getRecipientUserIds(targetLevel, capa.assignedTo);

      // Write audit log for SLA breach
      await writeAuditLog({
        issueId:   capa.issueId,
        action:    'capa_sla_breach',
        actorId:   0,             // system actor
        actorName: 'System',
        actorRole: 'Superuser',
        context:   JSON.stringify({ level: targetLevel, overdueDays, capaNumber: capa.capaNumber, recipientUserIds }),
        ipAddress: '127.0.0.1',
      });

      // Record that this level fired
      await db.insert(oiCapaEscalationLog).values({
        capaId:  capa.id,
        level:   targetLevel,
      }).onConflictDoNothing();

      fired++;
      console.log(`[CAPA Escalation] L${targetLevel} fired for ${capa.capaNumber} (${overdueDays}d overdue)`);
    }

    if (fired > 0) {
      console.log(`[CAPA Escalation] Run complete — ${fired} escalation(s) fired`);
    }
  } catch (err) {
    console.error("[CAPA Escalation] Error during escalation run:", err);
  }
}

export function startCapaEscalationScheduler(): void {
  // Nightly at 01:00 IST (19:30 UTC previous day)
  cron.schedule("30 19 * * *", () => {
    console.log("[CAPA Escalation] Nightly run triggered");
    runCapaEscalation();
  });
  console.log("[CAPA Escalation] Scheduler started — nightly at 01:00 IST");
}
