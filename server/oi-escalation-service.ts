import { db } from "./db";
import { oiEscalations, oiIssues, users, OiIssue } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "./notification-routes";
import { writeAuditLog } from "./oi-audit-service";

async function getUsersByRole(roles: string[]): Promise<{ id: number; name: string }[]> {
  const allUsers = await db.select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.isActive as any, true));
  return allUsers.filter((u: any) => roles.includes(u.role));
}

async function sendEscalationNotification(params: {
  issueId: number;
  issueNumber: string;
  issueTitle: string;
  escalationType: string;
  recipientIds: number[];
  message: string;
  link: string;
}) {
  for (const userId of params.recipientIds) {
    await createNotification({
      userId,
      type: `oi_${params.escalationType}`,
      title: `OI Escalation: ${params.issueNumber}`,
      message: params.message,
      link: params.link,
      priority: "high",
      category: "operational_intelligence",
      sourceType: "oi_issue",
      sourceId: params.issueId,
    });
  }
}

async function createEscalationRecord(params: {
  issueId: number;
  escalationType: typeof oiEscalations.$inferInsert["escalationType"];
  triggeredBy: number | null;
  escalatedTo: number | null;
  context: string;
}): Promise<number> {
  const [esc] = await db.insert(oiEscalations).values({
    issueId: params.issueId,
    escalationType: params.escalationType,
    triggeredBy: params.triggeredBy,
    escalatedTo: params.escalatedTo,
    context: params.context,
    notificationSent: false,
  }).returning({ id: oiEscalations.id });

  await db.update(oiEscalations)
    .set({ notificationSent: true, notificationSentAt: new Date() })
    .where(eq(oiEscalations.id, esc.id));

  return esc.id;
}

export async function triggerS1ImmediateEscalation(issue: OiIssue, actorId: number): Promise<void> {
  const recipients = await getUsersByRole(["General Manager", "Superuser", "Manager", "Senior Manager"]);
  const recipientIds = recipients.map((u: any) => u.id);

  await createEscalationRecord({
    issueId: issue.id,
    escalationType: "s1_immediate",
    triggeredBy: actorId,
    escalatedTo: null,
    context: `S1 Critical issue captured: ${issue.issueNumber} — ${issue.title}`,
  });

  await sendEscalationNotification({
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    issueTitle: issue.title,
    escalationType: "s1_immediate",
    recipientIds,
    message: `CRITICAL: S1 issue ${issue.issueNumber} has been captured and requires immediate attention.`,
    link: `/oi/issues/${issue.id}`,
  });

  await writeAuditLog({
    issueId: issue.id,
    action: "escalated",
    actorId,
    actorName: "System",
    actorRole: "System",
    context: `S1 immediate escalation triggered; notified ${recipientIds.length} recipients`,
  });
}

export async function triggerSafetyEscalation(issue: OiIssue, actorId: number, actorName: string, actorRole: string): Promise<void> {
  const recipients = await getUsersByRole(["General Manager", "Superuser"]);
  const complianceOwnerRecipients: number[] = issue.complianceOwner ? [issue.complianceOwner] : [];
  const recipientIds = [...new Set([...recipients.map((u: any) => u.id), ...complianceOwnerRecipients])];

  await createEscalationRecord({
    issueId: issue.id,
    escalationType: "safety_escalation",
    triggeredBy: actorId,
    escalatedTo: issue.complianceOwner ?? null,
    context: `Safety criticality set to critical on ${issue.issueNumber}`,
  });

  await sendEscalationNotification({
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    issueTitle: issue.title,
    escalationType: "safety_escalation",
    recipientIds,
    message: `Safety critical issue ${issue.issueNumber} requires immediate attention.`,
    link: `/oi/issues/${issue.id}`,
  });

  await writeAuditLog({
    issueId: issue.id,
    action: "escalated",
    actorId,
    actorName,
    actorRole,
    context: "Safety escalation triggered (safety_criticality = critical)",
  });
}

export async function triggerStatutoryEscalation(issue: OiIssue, actorId: number, actorName: string, actorRole: string): Promise<void> {
  const recipients = await getUsersByRole(["General Manager", "Superuser"]);
  const complianceOwnerRecipients: number[] = issue.complianceOwner ? [issue.complianceOwner] : [];
  const recipientIds = [...new Set([...recipients.map((u: any) => u.id), ...complianceOwnerRecipients])];

  await createEscalationRecord({
    issueId: issue.id,
    escalationType: "statutory_escalation",
    triggeredBy: actorId,
    escalatedTo: issue.complianceOwner ?? null,
    context: `Statutory criticality set to high on ${issue.issueNumber}`,
  });

  await sendEscalationNotification({
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    issueTitle: issue.title,
    escalationType: "statutory_escalation",
    recipientIds,
    message: `Statutory high-risk issue ${issue.issueNumber} requires compliance attention.`,
    link: `/oi/issues/${issue.id}`,
  });

  await writeAuditLog({
    issueId: issue.id,
    action: "escalated",
    actorId,
    actorName,
    actorRole,
    context: "Statutory escalation triggered (statutory_criticality = high)",
  });
}

export async function triggerFinancialEscalation(issue: OiIssue, actorId: number, actorName: string, actorRole: string): Promise<void> {
  const recipients = await getUsersByRole(["General Manager", "Superuser"]);
  const financialOwnerRecipients: number[] = issue.financialOwner ? [issue.financialOwner] : [];
  const recipientIds = [...new Set([...recipients.map((u: any) => u.id), ...financialOwnerRecipients])];

  await createEscalationRecord({
    issueId: issue.id,
    escalationType: "financial_escalation",
    triggeredBy: actorId,
    escalatedTo: issue.financialOwner ?? null,
    context: `Consequential damage flag set on ${issue.issueNumber}`,
  });

  await sendEscalationNotification({
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    issueTitle: issue.title,
    escalationType: "financial_escalation",
    recipientIds,
    message: `Consequential damage exposure flagged on ${issue.issueNumber}.`,
    link: `/oi/issues/${issue.id}`,
  });

  await writeAuditLog({
    issueId: issue.id,
    action: "escalated",
    actorId,
    actorName,
    actorRole,
    context: "Financial escalation triggered (consequential_damage_flag = true)",
  });
}

export async function triggerOverdueEscalation(
  issue: OiIssue,
  type: "overdue_response" | "overdue_closure"
): Promise<void> {
  const recipients = await getUsersByRole(["General Manager", "Superuser", "Manager", "Senior Manager"]);
  const ownerRecipients: number[] = [];
  if (issue.assignedTo) ownerRecipients.push(issue.assignedTo);
  if (issue.escalationOwner) ownerRecipients.push(issue.escalationOwner);
  const recipientIds = [...new Set([...recipients.map((u: any) => u.id), ...ownerRecipients])];

  const label = type === "overdue_response" ? "Response" : "Closure";
  await createEscalationRecord({
    issueId: issue.id,
    escalationType: type,
    triggeredBy: null,
    escalatedTo: issue.escalationOwner ?? null,
    context: `${label} SLA breached on ${issue.issueNumber}`,
  });

  await sendEscalationNotification({
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    issueTitle: issue.title,
    escalationType: type,
    recipientIds,
    message: `${label} SLA breached on ${issue.issueNumber}: ${issue.title}`,
    link: `/oi/issues/${issue.id}`,
  });

  await writeAuditLog({
    issueId: issue.id,
    action: "escalated",
    actorId: 0,
    actorName: "Scheduler",
    actorRole: "System",
    context: `${label} SLA breach escalation triggered automatically`,
  });
}
