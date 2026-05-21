import cron from "node-cron";
import { db } from "./db";
import { oiIssues } from "@shared/schema";
import { and, eq, isNotNull, lt, isNull } from "drizzle-orm";
import { triggerOverdueEscalation } from "./oi-escalation-service";

export function startOiScheduler(): void {
  // SLA breach check — every hour
  cron.schedule("0 * * * *", async () => {
    try {
      const now = new Date();

      // Response SLA breach
      const responseBreaches = await db.select()
        .from(oiIssues)
        .where(
          and(
            eq(oiIssues.responseSlaBreached, false),
            isNotNull(oiIssues.responseDueAt),
            lt(oiIssues.responseDueAt, now)
          )
        );

      for (const issue of responseBreaches) {
        await db.update(oiIssues)
          .set({ responseSlaBreached: true, updatedAt: now })
          .where(eq(oiIssues.id, issue.id));
        await triggerOverdueEscalation(issue as any, "overdue_response");
      }

      // Closure SLA breach
      const closureBreaches = await db.select()
        .from(oiIssues)
        .where(
          and(
            eq(oiIssues.closureSlaBreached, false),
            isNotNull(oiIssues.closureDueAt),
            lt(oiIssues.closureDueAt, now)
          )
        );

      for (const issue of closureBreaches) {
        await db.update(oiIssues)
          .set({ closureSlaBreached: true, updatedAt: now })
          .where(eq(oiIssues.id, issue.id));
        await triggerOverdueEscalation(issue as any, "overdue_closure");
      }

      if (responseBreaches.length + closureBreaches.length > 0) {
        console.log(`[OI Scheduler] SLA breach check: ${responseBreaches.length} response, ${closureBreaches.length} closure`);
      }
    } catch (err) {
      console.error("[OI Scheduler] SLA breach check error:", err);
    }
  });

  console.log("[OI Scheduler] Started — SLA breach check every hour");
}
