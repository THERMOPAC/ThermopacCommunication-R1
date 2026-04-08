import { Router, Request, Response } from 'express';
import { db } from './db';
import { pool } from './db';
import { 
  projectItemDrawings,
  engineeringChangeRequests,
  engineeringChangeNotices,
  changeDocuments,
  users,
  projectItems
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

export function setupProjectItemDetailRoutes(app: Router) {
  app.get('/api/project-items/:projectItemId/drawings', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const drawings = await db
        .select()
        .from(projectItemDrawings)
        .where(eq(projectItemDrawings.projectItemId, projectItemId))
        .orderBy(desc(projectItemDrawings.revision), desc(projectItemDrawings.createdAt));
      res.json(drawings);
    } catch (error: any) {
      console.error('Error fetching project item drawings:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/project-items/:projectItemId/drawings', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const user = req.user as any;

      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) {
        return res.status(404).json({ message: 'Project item not found' });
      }
      const pi = piResult[0];

      const drawingData = {
        projectItemId,
        projectId: pi.projectId,
        drawingNumber: req.body.drawingNumber,
        title: req.body.title,
        revision: req.body.revision || '00',
        revisionDate: new Date(),
        status: req.body.status || 'Draft',
        format: req.body.format || null,
        sheetSize: req.body.sheetSize || null,
        scale: req.body.scale || null,
        notes: req.body.notes || null,
        uploadedBy: user.id,
      };

      const result = await db.insert(projectItemDrawings).values(drawingData).returning();
      res.status(201).json(result[0]);
    } catch (error: any) {
      console.error('Error creating project item drawing:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/project-items/drawings/:drawingId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingId = parseInt(req.params.drawingId);
      const updates: any = { updatedAt: new Date() };
      if (req.body.drawingNumber !== undefined) updates.drawingNumber = req.body.drawingNumber;
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.revision !== undefined) updates.revision = req.body.revision;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.format !== undefined) updates.format = req.body.format;
      if (req.body.sheetSize !== undefined) updates.sheetSize = req.body.sheetSize;
      if (req.body.scale !== undefined) updates.scale = req.body.scale;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;

      const result = await db
        .update(projectItemDrawings)
        .set(updates)
        .where(eq(projectItemDrawings.id, drawingId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ message: 'Drawing not found' });
      }
      res.json(result[0]);
    } catch (error: any) {
      console.error('Error updating drawing:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/project-items/drawings/:drawingId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const drawingId = parseInt(req.params.drawingId);
      const result = await db
        .delete(projectItemDrawings)
        .where(eq(projectItemDrawings.id, drawingId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ message: 'Drawing not found' });
      }
      res.json({ message: 'Drawing deleted', id: drawingId });
    } catch (error: any) {
      console.error('Error deleting drawing:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/project-items/:projectItemId/ecr', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const ecrs = await db
        .select({
          ecr: engineeringChangeRequests,
          requestedByUser: {
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
          }
        })
        .from(engineeringChangeRequests)
        .leftJoin(users, eq(engineeringChangeRequests.requested_by, users.id))
        .where(eq(engineeringChangeRequests.project_item_id, projectItemId))
        .orderBy(desc(engineeringChangeRequests.created_at));
      
      res.json(ecrs.map(r => ({ ...r.ecr, requestedByUser: r.requestedByUser })));
    } catch (error: any) {
      console.error('Error fetching ECRs:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/project-items/:projectItemId/ecn', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const ecns = await db
        .select({
          ecn: engineeringChangeNotices,
          issuedByUser: {
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
          }
        })
        .from(engineeringChangeNotices)
        .leftJoin(users, eq(engineeringChangeNotices.issued_by, users.id))
        .where(eq(engineeringChangeNotices.project_item_id, projectItemId))
        .orderBy(desc(engineeringChangeNotices.created_at));
      
      res.json(ecns.map(r => ({ ...r.ecn, issuedByUser: r.issuedByUser })));
    } catch (error: any) {
      console.error('Error fetching ECNs:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/project-items/:projectItemId/ecr', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const user = req.user as any;

      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ message: 'Project item not found' });
      const pi = piResult[0];

      const client = await pool.connect();
      try {
        const seqResult = await client.query(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(document_number FROM 'ECR-(\\d+)') AS INTEGER)), 0) + 1 AS next_seq FROM engineering_change_requests"
        );
        const nextSeq = seqResult.rows[0].next_seq;
        const docNumber = `ECR-${String(nextSeq).padStart(5, '0')}`;

        const result = await db.insert(engineeringChangeRequests).values({
          document_number: docNumber,
          item_id: pi.itemId || 1,
          description: req.body.description,
          reason: req.body.reason,
          status: 'Draft',
          requested_by: user.id,
          project_id: pi.projectId,
          project_item_id: projectItemId,
          notes: req.body.notes || null,
        }).returning();

        res.status(201).json(result[0]);
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Error creating ECR:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/project-items/:projectItemId/ecn', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const user = req.user as any;

      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ message: 'Project item not found' });
      const pi = piResult[0];

      const client = await pool.connect();
      try {
        const seqResult = await client.query(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(document_number FROM 'ECN-(\\d+)') AS INTEGER)), 0) + 1 AS next_seq FROM engineering_change_notices"
        );
        const nextSeq = seqResult.rows[0].next_seq;
        const docNumber = `ECN-${String(nextSeq).padStart(5, '0')}`;

        const result = await db.insert(engineeringChangeNotices).values({
          document_number: docNumber,
          item_id: pi.itemId || 1,
          description: req.body.description,
          implementation_details: req.body.implementationDetails || '',
          status: 'Draft',
          issued_by: user.id,
          project_id: pi.projectId,
          project_item_id: projectItemId,
          ecr_id: req.body.ecrId || null,
          resulting_revision: req.body.resultingRevision || null,
          notes: req.body.notes || null,
        }).returning();

        res.status(201).json(result[0]);
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('Error creating ECN:', error);
      res.status(500).json({ message: error.message });
    }
  });

  console.log('Project Item Detail routes registered at /api/project-items/:id/drawings, /ecr, /ecn');
}
