import { db } from "./db";
import { oiLessonAuditLog } from "@shared/schema";

type LessonAuditAction =
  | "lesson_created" | "lesson_submitted_for_review" | "lesson_reviewer_assigned"
  | "lesson_reviewer_voted" | "lesson_review_recused" | "lesson_approved"
  | "lesson_rejected" | "lesson_published" | "lesson_archived" | "lesson_revised"
  | "lesson_linked" | "lesson_unlinked" | "lesson_recurrence_recorded"
  | "lesson_effectiveness_reviewed" | "lesson_cross_project_approved"
  | "lesson_acknowledgment_required" | "lesson_acknowledged";

export async function writeLessonAuditLog(params: {
  lessonId:   number;
  action:     LessonAuditAction;
  actorId:    number;
  actorName:  string;
  actorRole:  string;
  fieldName?: string | null;
  oldValue?:  string | null;
  newValue?:  string | null;
  context?:   string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(oiLessonAuditLog).values({
    lessonId:  params.lessonId,
    action:    params.action as any,
    actorId:   params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    fieldName: params.fieldName ?? null,
    oldValue:  params.oldValue ?? null,
    newValue:  params.newValue ?? null,
    context:   params.context ? params.context.substring(0, 200) : null,
    ipAddress: params.ipAddress ?? null,
  });
}
