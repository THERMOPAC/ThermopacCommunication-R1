import express, { Request, Response } from 'express';
import { db } from './db';
import { sql, eq, and } from 'drizzle-orm';
import {
  engineeringChangeRequests,
  engineeringChangeNotices,
  epcDrawingControls,
} from '@shared/schema';
import { requirePageAccess, checkProjectMembership } from './utils/permission-utils';
import { createEpcTask, createEpcAlert, createEpcAlertMulti, resolveAssignee, resolveProjectCode, resolveManagerId } from './epc-task-helpers';
import * as epcCoding from './epc-coding';
import { markAttachmentsSuperseded } from './epc-document-routes';

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function roleLevel(role: string): number {
  return roleHierarchy[role] ?? 99;
}

async function verifyProjectAccess(userId: number, userRole: string, projectId: number, res: Response): Promise<boolean> {
  const { isMember } = await checkProjectMembership(userId, userRole, projectId);
  if (!isMember) {
    console.warn(`[ECR/ECN_ACCESS_DENIED] userId=${userId} role=${userRole} projectId=${projectId}`);
    res.status(403).json({ error: 'Project access denied', code: 'PROJECT_ACCESS_DENIED', projectId });
    return false;
  }
  return true;
}

async function loadDrawingControl(id: number) {
  const result = await db.execute(sql`SELECT * FROM epc_drawing_controls WHERE id = ${id}`);
  return result.rows.length > 0 ? result.rows[0] as any : null;
}

async function auditLog(projectId: number, eventName: string, payload: any, emittedBy: string) {
  await db.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
    VALUES (${projectId}, ${eventName}, ${JSON.stringify(payload)}::jsonb, ${emittedBy}, NOW())`);
}

async function getNextEcrNumber(projectId: number): Promise<string> {
  const { getNextDocSeq } = await import('./doc-sequence-service');
  const seq = await getNextDocSeq('ECR', projectId, db);
  const projResult = await db.execute(sql`SELECT code FROM projects WHERE id = ${projectId}`);
  const projectCode = projResult.rows.length > 0 ? (projResult.rows[0] as any).code : `P${projectId}`;
  return `${projectCode}-ECR-${seq}`;
}

async function getNextEcnNumber(projectId: number): Promise<string> {
  const { getNextDocSeq } = await import('./doc-sequence-service');
  const seq = await getNextDocSeq('ECN', projectId, db);
  const projResult = await db.execute(sql`SELECT code FROM projects WHERE id = ${projectId}`);
  const projectCode = projResult.rows.length > 0 ? (projResult.rows[0] as any).code : `P${projectId}`;
  return `${projectCode}-ECN-${seq}`;
}

export function setupDrawingEcrEcnRoutes(app: express.Express) {

  app.get('/api/drawing-controls/:drawingControlId/ecr', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingControlId = parseInt(req.params.drawingControlId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Drawing control record not found' });
      if (!(await verifyProjectAccess(userId, userRole, dwg.project_id, res))) return;
      const results = await db.execute(sql`
        SELECT ecr.*, u.username AS requested_by_name, u2.username AS approved_by_name
        FROM engineering_change_requests ecr
        LEFT JOIN users u ON u.id = ecr.requested_by
        LEFT JOIN users u2 ON u2.id = ecr.approved_by
        WHERE ecr.drawing_control_id = ${drawingControlId}
        ORDER BY ecr.created_at DESC
      `);
      res.json(results.rows);
    } catch (error) {
      console.error('[ECR] List error:', error);
      res.status(500).json({ error: 'Failed to fetch ECRs' });
    }
  });

  app.get('/api/drawing-controls/:drawingControlId/ecn', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingControlId = parseInt(req.params.drawingControlId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Drawing control record not found' });
      if (!(await verifyProjectAccess(userId, userRole, dwg.project_id, res))) return;
      const results = await db.execute(sql`
        SELECT ecn.*, u.username AS issued_by_name, u2.username AS implemented_by_name,
               ecr.document_number AS ecr_document_number
        FROM engineering_change_notices ecn
        LEFT JOIN users u ON u.id = ecn.issued_by
        LEFT JOIN users u2 ON u2.id = ecn.implemented_by
        LEFT JOIN engineering_change_requests ecr ON ecr.id = ecn.ecr_id
        WHERE ecn.drawing_control_id = ${drawingControlId}
        ORDER BY ecn.created_at DESC
      `);
      res.json(results.rows);
    } catch (error) {
      console.error('[ECN] List error:', error);
      res.status(500).json({ error: 'Failed to fetch ECNs' });
    }
  });

  app.get('/api/drawing-controls/:drawingControlId/ecr/approved', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingControlId = parseInt(req.params.drawingControlId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;
      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Drawing control record not found' });
      if (!(await verifyProjectAccess(userId, userRole, dwg.project_id, res))) return;
      const results = await db.execute(sql`
        SELECT ecr.id, ecr.document_number, ecr.description, ecr.reason
        FROM engineering_change_requests ecr
        WHERE ecr.drawing_control_id = ${drawingControlId} AND ecr.status = 'Approved'
        AND NOT EXISTS (SELECT 1 FROM engineering_change_notices ecn WHERE ecn.ecr_id = ecr.id)
        ORDER BY ecr.created_at DESC
      `);
      res.json(results.rows);
    } catch (error) {
      console.error('[ECR] Approved list error:', error);
      res.status(500).json({ error: 'Failed to fetch approved ECRs' });
    }
  });

  app.post('/api/drawing-controls/:drawingControlId/ecr', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingControlId = parseInt(req.params.drawingControlId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 3) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Manager or above.' });
      }

      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Drawing control record not found' });
      if (!(await verifyProjectAccess(userId, userRole, dwg.project_id, res))) return;

      const { description, reason } = req.body;
      if (!description?.trim()) return res.status(400).json({ error: 'description is required' });
      if (!reason?.trim()) return res.status(400).json({ error: 'reason is required' });

      const documentNumber = await getNextEcrNumber(dwg.project_id);

      const inserted = await db.insert(engineeringChangeRequests).values({
        document_number: documentNumber,
        item_id: dwg.master_item_id || 0,
        description: description.trim(),
        reason: reason.trim(),
        status: 'Draft',
        requested_by: userId,
        requested_date: new Date(),
        project_id: dwg.project_id,
        project_item_id: dwg.project_item_id,
        drawing_control_id: drawingControlId,
        notes: req.body.notes?.trim() || null,
      }).returning();

      await auditLog(dwg.project_id, 'ecr.created', {
        ecrId: inserted[0].id, documentNumber, drawingControlId,
        dwgControlNumber: dwg.dwg_control_number, revisionCode: dwg.revision_code,
        createdBy: userId, description: description.trim(),
      }, 'drawing_ecr');

      console.log(`[ECR] Created ${documentNumber} for DWG ${dwg.dwg_control_number} rev ${dwg.revision_code}, user ${userId}`);
      res.status(201).json(inserted[0]);
    } catch (error) {
      console.error('[ECR] Create error:', error);
      res.status(500).json({ error: 'Failed to create ECR' });
    }
  });

  app.put('/api/drawing-ecr/:id/submit', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 3) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Manager or above.' });
      }

      const ecrResult = await db.execute(sql`SELECT * FROM engineering_change_requests WHERE id = ${id}`);
      if (ecrResult.rows.length === 0) return res.status(404).json({ error: 'ECR not found' });
      const ecr = ecrResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecr.project_id, res))) return;

      if (ecr.status !== 'Draft') {
        return res.status(400).json({ error: `Cannot submit: ECR status is '${ecr.status}', must be 'Draft'` });
      }

      await db.update(engineeringChangeRequests).set({
        status: 'Submitted',
        updated_at: new Date(),
      }).where(eq(engineeringChangeRequests.id, id));

      await auditLog(ecr.project_id, 'ecr.submitted', {
        ecrId: id, documentNumber: ecr.document_number,
        drawingControlId: ecr.drawing_control_id, submittedBy: userId,
      }, 'drawing_ecr');

      const projectCode = await resolveProjectCode(ecr.project_id, db);
      const managerId = await resolveManagerId(ecr.project_id, db);
      if (managerId) {
        await createEpcTask({
          projectId: ecr.project_id, entityType: 'ecr', recordId: id, actionCode: 'ecr_review',
          title: `Review ECR ${ecr.document_number} on ${projectCode}`,
          description: `Engineering Change Request ${ecr.document_number} has been submitted for review. Reason: ${ecr.reason}`,
          assignedTo: managerId, createdBy: userId, priority: 'High', dueDays: 5,
        });
      }

      console.log(`[ECR] ${ecr.document_number} submitted by user ${userId}`);
      res.json({ success: true, message: `ECR ${ecr.document_number} submitted for review` });
    } catch (error) {
      console.error('[ECR] Submit error:', error);
      res.status(500).json({ error: 'Failed to submit ECR' });
    }
  });

  app.put('/api/drawing-ecr/:id/approve', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 2) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Senior Manager or above.' });
      }

      const ecrResult = await db.execute(sql`SELECT * FROM engineering_change_requests WHERE id = ${id}`);
      if (ecrResult.rows.length === 0) return res.status(404).json({ error: 'ECR not found' });
      const ecr = ecrResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecr.project_id, res))) return;

      if (ecr.status !== 'Submitted') {
        return res.status(400).json({ error: `Cannot approve: ECR status is '${ecr.status}', must be 'Submitted'` });
      }

      await db.update(engineeringChangeRequests).set({
        status: 'Approved',
        approved_by: userId,
        approved_date: new Date(),
        notes: req.body.notes?.trim() || ecr.notes,
        updated_at: new Date(),
      }).where(eq(engineeringChangeRequests.id, id));

      await auditLog(ecr.project_id, 'ecr.approved', {
        ecrId: id, documentNumber: ecr.document_number,
        drawingControlId: ecr.drawing_control_id, approvedBy: userId,
      }, 'drawing_ecr');

      const ecrApprProjectCode = await resolveProjectCode(ecr.project_id, db);
      const ecrApprDesignLead = await resolveAssignee(ecr.project_id, 'Engineering', userId, db);
      const ecrApprPM = await resolveManagerId(ecr.project_id, db);

      // Alert the original requester that their ECR has been approved
      const ecrApprRecipients = [
        ecr.requested_by,
        ecrApprDesignLead,
        ecrApprPM,
      ].filter((v, i, a) => v && a.indexOf(v) === i) as number[];

      await createEpcAlertMulti(ecrApprRecipients, {
        type: 'epc_ecr_approved',
        title: `ECR ${ecr.document_number} Approved`,
        message: `Engineering Change Request ${ecr.document_number} on project ${ecrApprProjectCode} has been approved. An Engineering Change Notice (ECN) can now be raised to implement the change. Description: ${ecr.description}`,
        link: '/epc/drawing-controls', priority: 'high',
        sourceType: 'epc_automation', sourceId: id, createdBy: userId,
        entityType: 'ecr', recordId: id, actionCode: 'ecr_approved',
      });

      // Task for Engineering Lead — raise the ECN
      if (ecrApprDesignLead) {
        await createEpcTask({
          projectId: ecr.project_id, entityType: 'ecr', recordId: id, actionCode: 'ecn_raise',
          title: `Raise ECN for approved ECR ${ecr.document_number} on ${ecrApprProjectCode}`,
          description: `ECR ${ecr.document_number} has been approved. Raise an Engineering Change Notice (ECN) to implement the change. Reason: ${ecr.reason}. Description: ${ecr.description}`,
          assignedTo: ecrApprDesignLead, createdBy: userId, priority: 'High', dueDays: 5,
        });
      }

      console.log(`[ECR] ${ecr.document_number} approved by user ${userId}`);
      res.json({ success: true, message: `ECR ${ecr.document_number} approved` });
    } catch (error) {
      console.error('[ECR] Approve error:', error);
      res.status(500).json({ error: 'Failed to approve ECR' });
    }
  });

  app.put('/api/drawing-ecr/:id/reject', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 2) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Senior Manager or above.' });
      }

      const ecrResult = await db.execute(sql`SELECT * FROM engineering_change_requests WHERE id = ${id}`);
      if (ecrResult.rows.length === 0) return res.status(404).json({ error: 'ECR not found' });
      const ecr = ecrResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecr.project_id, res))) return;

      if (ecr.status !== 'Submitted') {
        return res.status(400).json({ error: `Cannot reject: ECR status is '${ecr.status}', must be 'Submitted'` });
      }

      const rejectReason = req.body.reason?.trim();
      if (!rejectReason) return res.status(400).json({ error: 'Rejection reason is required' });

      await db.update(engineeringChangeRequests).set({
        status: 'Rejected',
        approved_by: userId,
        approved_date: new Date(),
        notes: `Rejected: ${rejectReason}${ecr.notes ? `\n\nOriginal notes: ${ecr.notes}` : ''}`,
        updated_at: new Date(),
      }).where(eq(engineeringChangeRequests.id, id));

      await auditLog(ecr.project_id, 'ecr.rejected', {
        ecrId: id, documentNumber: ecr.document_number,
        drawingControlId: ecr.drawing_control_id, rejectedBy: userId, reason: rejectReason,
      }, 'drawing_ecr');

      console.log(`[ECR] ${ecr.document_number} rejected by user ${userId}`);
      res.json({ success: true, message: `ECR ${ecr.document_number} rejected` });
    } catch (error) {
      console.error('[ECR] Reject error:', error);
      res.status(500).json({ error: 'Failed to reject ECR' });
    }
  });

  app.post('/api/drawing-controls/:drawingControlId/ecn', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingControlId = parseInt(req.params.drawingControlId);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 2) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Senior Manager or above.' });
      }

      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Drawing control record not found' });
      if (!(await verifyProjectAccess(userId, userRole, dwg.project_id, res))) return;

      const { ecr_id, description, implementation_details } = req.body;

      if (!ecr_id && roleLevel(userRole) > 0) {
        return res.status(403).json({ error: 'ECN must reference an approved ECR. Standalone ECN creation is restricted to Superuser.' });
      }

      if (ecr_id) {
        const ecrResult = await db.execute(sql`SELECT * FROM engineering_change_requests WHERE id = ${ecr_id}`);
        if (ecrResult.rows.length === 0) return res.status(404).json({ error: 'Referenced ECR not found' });
        const ecr = ecrResult.rows[0] as any;
        if (ecr.status !== 'Approved') {
          return res.status(400).json({ error: `Referenced ECR status is '${ecr.status}', must be 'Approved'` });
        }
        if (ecr.drawing_control_id !== drawingControlId) {
          return res.status(400).json({ error: 'Referenced ECR does not belong to this drawing' });
        }
        const existingEcn = await db.execute(sql`SELECT id FROM engineering_change_notices WHERE ecr_id = ${ecr_id}`);
        if (existingEcn.rows.length > 0) {
          return res.status(400).json({ error: 'An ECN already exists for this ECR' });
        }
      }

      if (!description?.trim()) return res.status(400).json({ error: 'description is required' });
      if (!implementation_details?.trim()) return res.status(400).json({ error: 'implementation_details is required' });

      const documentNumber = await getNextEcnNumber(dwg.project_id);

      const inserted = await db.insert(engineeringChangeNotices).values({
        document_number: documentNumber,
        ecr_id: ecr_id || null,
        item_id: dwg.master_item_id || 0,
        description: description.trim(),
        implementation_details: implementation_details.trim(),
        status: 'Draft',
        issued_by: userId,
        issued_date: new Date(),
        project_id: dwg.project_id,
        project_item_id: dwg.project_item_id,
        drawing_control_id: drawingControlId,
        notes: req.body.notes?.trim() || null,
      }).returning();

      await auditLog(dwg.project_id, 'ecn.created', {
        ecnId: inserted[0].id, documentNumber, drawingControlId,
        dwgControlNumber: dwg.dwg_control_number, revisionCode: dwg.revision_code,
        ecrId: ecr_id || null, createdBy: userId,
      }, 'drawing_ecn');

      console.log(`[ECN] Created ${documentNumber} for DWG ${dwg.dwg_control_number}, user ${userId}`);
      res.status(201).json(inserted[0]);
    } catch (error) {
      console.error('[ECN] Create error:', error);
      res.status(500).json({ error: 'Failed to create ECN' });
    }
  });

  app.put('/api/drawing-ecn/:id/issue', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 2) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Senior Manager or above.' });
      }

      const ecnResult = await db.execute(sql`SELECT * FROM engineering_change_notices WHERE id = ${id}`);
      if (ecnResult.rows.length === 0) return res.status(404).json({ error: 'ECN not found' });
      const ecn = ecnResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecn.project_id, res))) return;

      if (ecn.status !== 'Draft') {
        return res.status(400).json({ error: `Cannot issue: ECN status is '${ecn.status}', must be 'Draft'` });
      }

      await db.update(engineeringChangeNotices).set({
        status: 'Issued',
        updated_at: new Date(),
      }).where(eq(engineeringChangeNotices.id, id));

      await auditLog(ecn.project_id, 'ecn.issued', {
        ecnId: id, documentNumber: ecn.document_number,
        drawingControlId: ecn.drawing_control_id, issuedBy: userId,
      }, 'drawing_ecn');

      console.log(`[ECN] ${ecn.document_number} issued by user ${userId}`);
      res.json({ success: true, message: `ECN ${ecn.document_number} issued` });
    } catch (error) {
      console.error('[ECN] Issue error:', error);
      res.status(500).json({ error: 'Failed to issue ECN' });
    }
  });

  app.put('/api/drawing-ecn/:id/implement', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 1) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: General Manager or Superuser.' });
      }

      const ecnResult = await db.execute(sql`SELECT * FROM engineering_change_notices WHERE id = ${id}`);
      if (ecnResult.rows.length === 0) return res.status(404).json({ error: 'ECN not found' });
      const ecn = ecnResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecn.project_id, res))) return;

      if (ecn.status !== 'Issued') {
        return res.status(400).json({ error: `Cannot implement: ECN status is '${ecn.status}', must be 'Issued'` });
      }

      const drawingControlId = ecn.drawing_control_id;
      if (!drawingControlId) {
        return res.status(400).json({ error: 'ECN is not linked to a drawing control record' });
      }

      const dwg = await loadDrawingControl(drawingControlId);
      if (!dwg) return res.status(404).json({ error: 'Linked drawing control record not found' });
      if (!dwg.is_current) {
        return res.status(400).json({ error: 'Cannot implement ECN: linked drawing is not the current revision' });
      }

      const nextRevisionCode = epcCoding.incrementRevisionCode(dwg.revision_code);

      const result = await db.transaction(async (tx) => {
        const inserted = await tx.insert(epcDrawingControls).values({
          dwgControlNumber: dwg.dwg_control_number,
          revisionCode: nextRevisionCode,
          isCurrent: true,
          revisionStatus: 'draft',
          supersedesId: drawingControlId,
          projectId: dwg.project_id,
          projectItemId: dwg.project_item_id,
          masterItemId: dwg.master_item_id,
          designDrawingId: dwg.design_drawing_id,
          drawingNumber: dwg.drawing_number,
          drawingTitle: dwg.drawing_title,
          drawingRevision: dwg.drawing_revision,
          drawingCategory: dwg.drawing_category,
          disciplineCode: dwg.discipline_code,
          itemCode: dwg.item_code,
          itemDescription: dwg.item_description,
          classificationSnapshot: dwg.classification_snapshot,
          drawingPurpose: dwg.drawing_purpose,
          procurementReleaseRequired: dwg.procurement_release_required,
          manufacturingReleaseRequired: dwg.manufacturing_release_required,
          clientApprovalRequired: dwg.client_approval_required,
          clientApprovalStatus: dwg.client_approval_required ? 'pending' : 'not_required',
          status: 'draft',
          notes: `Created via ECN ${ecn.document_number}. ${ecn.description}`,
          createdBy: userId,
        }).returning();

        await tx.update(epcDrawingControls).set({
          status: 'superseded',
          isCurrent: false,
          revisionStatus: 'superseded',
          supersededBy: inserted[0].id,
          supersededAt: new Date(),
          supersessionReason: `ECN ${ecn.document_number}: ${ecn.description}`,
          updatedAt: new Date(),
        }).where(eq(epcDrawingControls.id, drawingControlId));

        await tx.update(engineeringChangeNotices).set({
          status: 'Implemented',
          implementation_date: new Date(),
          implemented_by: userId,
          resulting_revision: nextRevisionCode,
          updated_at: new Date(),
        }).where(eq(engineeringChangeNotices.id, id));

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dwg.project_id}, 'ecn.implemented', ${JSON.stringify({
            ecnId: id, ecnDocumentNumber: ecn.document_number,
            oldDwgId: drawingControlId, oldDwgNumber: dwg.dwg_control_number, oldRevision: dwg.revision_code,
            newDwgId: inserted[0].id, newRevision: nextRevisionCode,
            implementedBy: userId, description: ecn.description,
            implementationDetails: ecn.implementation_details,
          })}::jsonb, 'drawing_ecn', NOW())`);

        await tx.execute(sql`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
          VALUES (${dwg.project_id}, 'drawing_control.superseded', ${JSON.stringify({
            oldDwgId: drawingControlId, oldDwgNumber: dwg.dwg_control_number, oldRevision: dwg.revision_code,
            newDwgId: inserted[0].id, newDwgNumber: dwg.dwg_control_number, newRevision: nextRevisionCode,
            supersessionReason: `ECN ${ecn.document_number}`, supersededBy: userId,
          })}::jsonb, 'drawing_ecn', NOW())`);

        await markAttachmentsSuperseded(dwg.dwg_control_number, dwg.revision_code, userId, dwg.project_id, tx);

        return inserted[0];
      });

      const projectCode = await resolveProjectCode(dwg.project_id, db);
      const designLead = await resolveAssignee(dwg.project_id, 'Engineering', userId, db);
      const pm = await resolveManagerId(dwg.project_id, db);
      const procurementLead = await resolveAssignee(dwg.project_id, 'Purchase', userId, db);
      const productionLead = await resolveAssignee(dwg.project_id, 'Production', userId, db);

      // Resolve the original ECR requester (if this ECN stems from an ECR)
      let ecrRequester: number | null = null;
      if (ecn.ecr_id) {
        const ecrRow = await db.execute(sql`SELECT requested_by FROM engineering_change_requests WHERE id = ${ecn.ecr_id}`);
        if (ecrRow.rows.length > 0) ecrRequester = (ecrRow.rows[0] as any).requested_by;
      }

      const ecnImplBase = {
        type: 'epc_supersession' as const, sourceType: 'epc_automation' as const,
        sourceId: id, createdBy: userId,
        entityType: 'drawing_control', recordId: drawingControlId, actionCode: 'ecn_implemented',
      };

      // Engineering, PM, and ECR requester alert
      const enggRecipients = [designLead, pm, ecrRequester].filter((v, i, a) => v && a.indexOf(v) === i) as number[];
      if (enggRecipients.length > 0) {
        await createEpcAlertMulti(enggRecipients, {
          ...ecnImplBase,
          title: `ECN ${ecn.document_number} implemented — Drawing ${dwg.dwg_control_number} revised`,
          message: `ECN ${ecn.document_number} has been implemented on project ${projectCode}. Drawing ${dwg.dwg_control_number} superseded from Rev ${dwg.revision_code} to Rev ${nextRevisionCode}. Review downstream BOMs and execution records.`,
          link: '/epc/drawing-controls', priority: 'high',
        });
      }

      // Procurement alert — POs may reference the old drawing revision
      if (procurementLead) {
        await createEpcAlertMulti([procurementLead], {
          ...ecnImplBase,
          title: `PO Alert: Drawing ${dwg.dwg_control_number} revised via ECN (Rev ${dwg.revision_code} → ${nextRevisionCode})`,
          message: `ECN ${ecn.document_number} on project ${projectCode} has been implemented. Drawing ${dwg.dwg_control_number} is now at Rev ${nextRevisionCode}. Review all open Purchase Orders — any PO referencing the old revision must be updated or held pending the new revision release.`,
          link: '/epc/purchase-orders', priority: 'high',
        });
        await createEpcTask({
          projectId: dwg.project_id, entityType: 'drawing_control', recordId: result.id, actionCode: 'po_ecn_review',
          title: `PO Review: Drawing ${dwg.dwg_control_number} revised via ECN ${ecn.document_number}`,
          description: `ECN ${ecn.document_number} revised Drawing ${dwg.dwg_control_number} from Rev ${dwg.revision_code} to Rev ${nextRevisionCode} on ${projectCode}. Review all open POs on this project — procurement against the old revision must be put on hold pending the new revision release.`,
          assignedTo: procurementLead, createdBy: userId, priority: 'High', dueDays: 3,
        });
      }

      // Production alert — MOs/WOs may reference the old drawing revision
      if (productionLead) {
        await createEpcAlertMulti([productionLead], {
          ...ecnImplBase,
          title: `MO Alert: Drawing ${dwg.dwg_control_number} revised via ECN (Rev ${dwg.revision_code} → ${nextRevisionCode})`,
          message: `ECN ${ecn.document_number} on project ${projectCode} has been implemented. Drawing ${dwg.dwg_control_number} is now at Rev ${nextRevisionCode}. Review all open Manufacturing / Work Orders — shop-floor execution against the old revision must be reviewed before proceeding.`,
          link: '/epc/work-orders', priority: 'high',
        });
        await createEpcTask({
          projectId: dwg.project_id, entityType: 'drawing_control', recordId: result.id, actionCode: 'mo_ecn_review',
          title: `MO Review: Drawing ${dwg.dwg_control_number} revised via ECN ${ecn.document_number}`,
          description: `ECN ${ecn.document_number} revised Drawing ${dwg.dwg_control_number} from Rev ${dwg.revision_code} to Rev ${nextRevisionCode} on ${projectCode}. Review all open Manufacturing / Work Orders on this project — execution against the old drawing revision must be reviewed before shop-floor work proceeds.`,
          assignedTo: productionLead, createdBy: userId, priority: 'High', dueDays: 3,
        });
      }

      if (designLead) {
        await createEpcTask({
          projectId: dwg.project_id, entityType: 'drawing_control', recordId: result.id, actionCode: 'ecn_post_implementation_review',
          title: `Review new Rev ${nextRevisionCode} of ${dwg.dwg_control_number} (via ECN ${ecn.document_number})`,
          description: `ECN ${ecn.document_number} created a new revision of ${dwg.dwg_control_number} on ${projectCode}. Upload revised drawing PDF, review BOM impacts, and progress through approval workflow.`,
          assignedTo: designLead, createdBy: userId, priority: 'High', dueDays: 5,
        });
      }

      console.log(`[ECN] ${ecn.document_number} implemented → DWG ${dwg.dwg_control_number} Rev ${dwg.revision_code} → Rev ${nextRevisionCode}, user ${userId}`);
      res.json({
        success: true,
        message: `ECN ${ecn.document_number} implemented. Drawing ${dwg.dwg_control_number} Rev ${dwg.revision_code} superseded → new Rev ${nextRevisionCode} created.`,
        newDrawingControl: result,
        previousRevision: dwg.revision_code,
        newRevision: nextRevisionCode,
      });
    } catch (error) {
      console.error('[ECN] Implement error:', error);
      res.status(500).json({ error: 'Failed to implement ECN' });
    }
  });

  app.put('/api/drawing-ecn/:id/close', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (roleLevel(userRole) > 2) {
        return res.status(403).json({ error: 'Insufficient permissions. Required role: Senior Manager or above.' });
      }

      const ecnResult = await db.execute(sql`SELECT * FROM engineering_change_notices WHERE id = ${id}`);
      if (ecnResult.rows.length === 0) return res.status(404).json({ error: 'ECN not found' });
      const ecn = ecnResult.rows[0] as any;
      if (!(await verifyProjectAccess(userId, userRole, ecn.project_id, res))) return;

      if (ecn.status !== 'Implemented') {
        return res.status(400).json({ error: `Cannot close: ECN status is '${ecn.status}', must be 'Implemented'` });
      }

      await db.update(engineeringChangeNotices).set({
        status: 'Closed',
        notes: req.body.notes?.trim() ? `${ecn.notes || ''}\nClosed: ${req.body.notes.trim()}` : ecn.notes,
        updated_at: new Date(),
      }).where(eq(engineeringChangeNotices.id, id));

      await auditLog(ecn.project_id, 'ecn.closed', {
        ecnId: id, documentNumber: ecn.document_number,
        drawingControlId: ecn.drawing_control_id, closedBy: userId,
      }, 'drawing_ecn');

      console.log(`[ECN] ${ecn.document_number} closed by user ${userId}`);
      res.json({ success: true, message: `ECN ${ecn.document_number} closed` });
    } catch (error) {
      console.error('[ECN] Close error:', error);
      res.status(500).json({ error: 'Failed to close ECN' });
    }
  });
}
