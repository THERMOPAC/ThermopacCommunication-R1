import { Router, Request, Response } from 'express';
import { db } from './db';
import { pool } from './db';
import { 
  projectItemDrawings,
  engineeringChangeRequests,
  engineeringChangeNotices,
  changeDocuments,
  users,
  projectItems,
  projects
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { resolveProjectGeoCodes } from './epc-coding';
import multer from 'multer';
import crypto from 'crypto';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { gcsStorage } from './utils/gcs-storage';
import { SapHttpsClient } from './sap-b1-integration/sap-https-client';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

function buildDrawingGcsPath(
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  operationalCode: string,
  itemCode: string,
  codeBars: string,
  revision: string,
  ext: string
): string {
  return `TPEL/${continentCode}/${countryCode}/${customerShortCode}/${fyCode}/${operationalCode}/${itemCode}/DWG/${codeBars}_rev-${revision}.${ext}`;
}

export function setupProjectItemDetailRoutes(app: Router) {

  app.get('/api/project-items/:projectItemId/gcs-path', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ message: 'Project item not found' });
      const pi = piResult[0];

      if (!pi.codeBars) return res.status(400).json({ message: 'Project item has no CodeBars assigned' });

      const geo = await resolveProjectGeoCodes(pi.projectId);
      const basePath = `TPEL/${geo.continentCode}/${geo.countryCode}/${geo.customerShortCode}/${geo.fyCode}/${geo.operationalCode}/${pi.itemCode}/DWG`;
      const examplePath = `${basePath}/${pi.codeBars}_rev-00.pdf`;

      res.json({
        basePath,
        examplePath,
        codeBars: pi.codeBars,
        itemCode: pi.itemCode,
        continentCode: geo.continentCode,
        countryCode: geo.countryCode,
        customerShortCode: geo.customerShortCode,
        fyCode: geo.fyCode,
        operationalCode: geo.operationalCode,
      });
    } catch (error: any) {
      console.error('Error getting GCS path:', error);
      res.status(500).json({ message: error.message });
    }
  });
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

  app.post('/api/project-items/:projectItemId/drawings', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const user = req.user as any;

      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) {
        return res.status(404).json({ message: 'Project item not found' });
      }
      const pi = piResult[0];

      if (!pi.codeBars) {
        return res.status(400).json({ message: 'Project item has no CodeBars — cannot upload drawing' });
      }

      const revision = req.body.revision || '00';
      let gcsObjectPath: string | null = null;
      let checksumSha256: string | null = null;
      let fileSize: number | null = null;
      let fileName: string | null = null;
      let mimeType: string | null = null;

      if (req.file) {
        if (req.file.mimetype !== 'application/pdf') {
          return res.status(400).json({ message: 'Only PDF files are allowed for drawings' });
        }
        const geo = await resolveProjectGeoCodes(pi.projectId);
        const ext = 'pdf';
        gcsObjectPath = buildDrawingGcsPath(
          geo.continentCode, geo.countryCode, geo.customerShortCode,
          geo.fyCode, geo.operationalCode,
          pi.itemCode!, pi.codeBars!, revision, ext
        );
        checksumSha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        fileSize = req.file.size;
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;

        await uploadFileWithDiagnostics(gcsObjectPath, req.file.buffer, req.file.mimetype);
        console.log(`Drawing uploaded to GCS: ${gcsObjectPath}`);
      }

      const drawingData = {
        projectItemId,
        projectId: pi.projectId,
        drawingNumber: pi.codeBars!,
        title: req.body.title,
        revision,
        revisionDate: new Date(),
        status: req.body.status || 'Draft',
        format: req.body.format || null,
        sheetSize: req.body.sheetSize || null,
        scale: req.body.scale || null,
        notes: req.body.notes || null,
        uploadedBy: user.id,
        gcsObjectPath,
        checksumSha256,
        fileSize,
        fileName,
        mimeType,
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

  app.post('/api/project-items/:projectItemId/sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ message: 'Project item not found' });
      const pi = piResult[0];

      if (!pi.codeBars || pi.codeBars.length !== 16) {
        return res.status(400).json({ message: 'Project item must have a valid 16-character CodeBars before SAP sync' });
      }
      if (!pi.itemCode) {
        return res.status(400).json({ message: 'Project item must have an item code before SAP sync' });
      }

      const projResult = await db.select().from(projects).where(eq(projects.id, pi.projectId));
      const project = projResult.length > 0 ? projResult[0] : null;

      const sapServiceUrl = 'https://59.152.52.58:50000/b1s/v1';
      const sapClient = new SapHttpsClient();

      let loginResponse;
      try {
        loginResponse = await sapClient.request({
          method: 'POST',
          url: `${sapServiceUrl}/Login`,
          headers: { 'Content-Type': 'application/json' },
          body: {
            CompanyDB: process.env.SAP_COMPANY_DB || 'TPEL_LIVE',
            UserName: process.env.SAP_USERNAME,
            Password: process.env.SAP_PASSWORD,
          },
          timeout: 30000,
        });
      } catch (connErr: any) {
        console.error('SAP B1 login connection error:', connErr.message);
        await db.update(projectItems).set({
          sapSynced: false,
          sapSyncError: `SAP connection failed: ${connErr.message}`,
          updatedAt: new Date(),
        }).where(eq(projectItems.id, projectItemId));
        return res.status(502).json({ message: `SAP connection failed: ${connErr.message}` });
      }

      if (loginResponse.statusCode !== 200) {
        const errDetail = loginResponse.body?.substring(0, 200) || 'Unknown error';
        await db.update(projectItems).set({
          sapSynced: false,
          sapSyncError: `SAP login failed (${loginResponse.statusCode}): ${errDetail}`,
          updatedAt: new Date(),
        }).where(eq(projectItems.id, projectItemId));
        return res.status(502).json({ message: `SAP login failed: ${loginResponse.statusCode}` });
      }

      const setCookieHeaders = loginResponse.headers['set-cookie'];
      const cookieArr = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [];
      const cookieStr = cookieArr.map((h: string) => h.split(';')[0].trim()).filter(Boolean).join('; ');
      const requestHeaders = { 'Content-Type': 'application/json', 'Cookie': cookieStr };

      const uom = pi.uom || 'Nos';
      const sapItemPayload: Record<string, any> = {
        ItemCode: pi.itemCode,
        ItemName: pi.description || pi.itemCode,
        BarCode: pi.codeBars,
        ItemsGroupCode: 104,
        SalesUnit: uom,
        PurchaseUnit: uom,
        InventoryUOM: uom,
        ItemType: 'itItems',
      };

      console.log(`[SAP Sync] Attempting to create/update item in SAP B1: ${pi.itemCode} (BarCode: ${pi.codeBars})`);

      let itemResponse = await sapClient.request({
        method: 'POST',
        url: `${sapServiceUrl}/Items`,
        headers: requestHeaders,
        body: sapItemPayload,
        timeout: 30000,
      });

      let sapResult: any = {};
      let syncError: string | null = null;

      if (itemResponse.ok) {
        try { sapResult = JSON.parse(itemResponse.body); } catch { sapResult = { ItemCode: pi.itemCode }; }
        console.log(`[SAP Sync] Item created successfully: ${pi.itemCode}`);
      } else if (itemResponse.statusCode === 400 && (itemResponse.body?.includes('-2035') || itemResponse.body?.includes('already exists') || itemResponse.body?.includes('-10'))) {
        console.log(`[SAP Sync] Item already exists in SAP, attempting PATCH update: ${pi.itemCode}`);
        const patchPayload = { ...sapItemPayload };
        delete (patchPayload as any).ItemCode;

        const patchResponse = await sapClient.request({
          method: 'PATCH',
          url: `${sapServiceUrl}/Items('${encodeURIComponent(pi.itemCode)}')`,
          headers: requestHeaders,
          body: patchPayload,
          timeout: 30000,
        });

        if (patchResponse.ok || patchResponse.statusCode === 204) {
          sapResult = { ItemCode: pi.itemCode, updated: true };
          console.log(`[SAP Sync] Item updated successfully: ${pi.itemCode}`);
        } else {
          syncError = `SAP update failed (${patchResponse.statusCode}): ${patchResponse.body?.substring(0, 300)}`;
          console.error(`[SAP Sync] Update failed:`, syncError);
        }
      } else {
        syncError = `SAP create failed (${itemResponse.statusCode}): ${itemResponse.body?.substring(0, 300)}`;
        console.error(`[SAP Sync] Create failed:`, syncError);
      }

      try {
        await sapClient.request({ method: 'POST', url: `${sapServiceUrl}/Logout`, headers: requestHeaders });
      } catch { }

      if (syncError) {
        await db.update(projectItems).set({
          sapSynced: false,
          sapSyncError: syncError,
          updatedAt: new Date(),
        }).where(eq(projectItems.id, projectItemId));
        return res.status(502).json({ message: syncError });
      }

      await db.update(projectItems).set({
        sapSynced: true,
        sapSyncedAt: new Date(),
        sapSyncError: null,
        updatedAt: new Date(),
      }).where(eq(projectItems.id, projectItemId));

      res.json({
        message: `Item ${pi.itemCode} synced to SAP B1 successfully`,
        sapResult,
        codeBars: pi.codeBars,
        itemCode: pi.itemCode,
        syncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('SAP sync error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  console.log('Project Item Detail routes registered at /api/project-items/:id/drawings, /ecr, /ecn, /sap-sync');
}
