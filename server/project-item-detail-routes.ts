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
  projects,
  PROJECT_ITEM_SOURCES,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { resolveProjectGeoCodes, buildDrawingGcsPath } from './epc-coding';
import multer from 'multer';
import crypto from 'crypto';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { gcsStorage } from './utils/gcs-storage';
import { sapSession } from './sap-b1-integration/sap-central-session';
import {
  SAP_CUSTOM_ITEM_CODE,
  SAP_CUSTOM_ITEM_NAME,
  SAP_CUSTOM_ITEM_BARCODE,
} from '@shared/constants/sap-custom-item';

// Phase 2 additional finding — SAP Session Unification Migration Plan v1.2
// Replaced independent SapHttpsClient login with sapSession.request().
// Removed raw credential reads, own login/logout, and manual cookie construction.
export async function syncProjectItemToSap(pi: any): Promise<{ sapResult?: any; error?: string }> {
  const isCustomItem = pi.source === PROJECT_ITEM_SOURCES.SALES_OFFER_CUSTOM;

  if (!isCustomItem) {
    if (!pi.codeBars || pi.codeBars.length !== 16) return { error: 'Project item must have a valid 16-character CodeBars' };
    if (!pi.itemCode) return { error: 'Project item must have an item code' };
  }

  const uom = pi.uom || 'Nos';
  const sapItemCode = isCustomItem ? SAP_CUSTOM_ITEM_CODE : pi.itemCode;
  const sapItemName = isCustomItem ? SAP_CUSTOM_ITEM_NAME : (pi.description || pi.itemCode);
  const sapBarCode  = isCustomItem ? SAP_CUSTOM_ITEM_BARCODE : pi.codeBars;

  const sapItemPayload: Record<string, any> = {
    ItemCode: sapItemCode,
    ItemName: sapItemName,
    BarCode: sapBarCode,
    ItemsGroupCode: 104,
    SalesUnit: uom,
    PurchaseUnit: uom,
    InventoryUOM: uom,
    ItemType: 'itItems',
  };

  console.log(`[SAP Sync] Attempting to create/update item: ${pi.itemCode} (BarCode: ${pi.codeBars}) via central session`);

  let sapResult: any = {};
  let syncError: string | null = null;

  try {
    const itemResponse = await sapSession.request({
      method: 'POST',
      path: '/b1s/v1/Items',
      body: sapItemPayload,
      timeout: 30000,
    });

    if (itemResponse.ok) {
      try { sapResult = JSON.parse(itemResponse.body); } catch { sapResult = { ItemCode: pi.itemCode }; }
      console.log(`[SAP Sync] Item created successfully: ${pi.itemCode}`);
    } else if (itemResponse.statusCode === 400 && (itemResponse.body?.includes('-2035') || itemResponse.body?.includes('already exists') || itemResponse.body?.includes('-10'))) {
      console.log(`[SAP Sync] Item already exists, attempting PATCH update: ${pi.itemCode}`);
      const patchPayload = { ...sapItemPayload };
      delete (patchPayload as any).ItemCode;

      const patchResponse = await sapSession.request({
        method: 'PATCH',
        path: `/b1s/v1/Items('${encodeURIComponent(pi.itemCode)}')`,
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
  } catch (connErr: any) {
    syncError = `SAP connection failed: ${connErr.message}`;
    console.error(`[SAP Sync] Connection error:`, syncError);
  }

  if (syncError) {
    await db.update(projectItems).set({ sapSynced: false, sapSyncError: syncError, updatedAt: new Date() }).where(eq(projectItems.id, pi.id));
    return { error: syncError };
  }

  await db.update(projectItems).set({ sapSynced: true, sapSyncedAt: new Date(), sapSyncError: null, updatedAt: new Date() }).where(eq(projectItems.id, pi.id));
  return { sapResult };
}

export async function syncProjectItemsToSapBatch(projectId: number): Promise<{ synced: number; failed: number; errors: string[] }> {
  const items = await db.select().from(projectItems).where(eq(projectItems.projectId, projectId));
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item.itemCode || !item.codeBars || item.codeBars.length !== 16) {
      console.log(`[SAP Batch Sync] Skipping item ${item.id} — missing itemCode or CodeBars`);
      continue;
    }
    const result = await syncProjectItemToSap(item);
    if (result.error) {
      failed++;
      errors.push(`${item.itemCode}: ${result.error}`);
    } else {
      synced++;
    }
  }

  console.log(`[SAP Batch Sync] Project ${projectId}: ${synced} synced, ${failed} failed`);
  return { synced, failed, errors };
}

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


export function setupProjectItemDetailRoutes(app: Router) {

  app.get('/api/project-items/:projectItemId/gcs-path', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ message: 'Project item not found' });
      const pi = piResult[0];

      if (!pi.codeBars) return res.status(400).json({ message: 'Project item has no CodeBars assigned' });

      const geo = await resolveProjectGeoCodes(pi.projectId);
      const basePath = `TPEL/${geo.continentCode}/${geo.countryCode}/${geo.customerCustToken}/${geo.fyCode}/${geo.projectSeq}/${pi.itemCode}/DWG`;
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
        projectCode: geo.projectCode,
        projectSeq: geo.projectSeq,
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
          geo.continentCode, geo.countryCode, geo.customerCustToken,
          geo.fyCode, geo.projectSeq,
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

  // ── BOM Controls: single-item SAP sync (check → create if absent) ──────────
  app.post('/api/project-items/:projectItemId/sap-sync', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectItemId = parseInt(req.params.projectItemId);
      const piResult = await db.select().from(projectItems).where(eq(projectItems.id, projectItemId));
      if (piResult.length === 0) return res.status(404).json({ error: 'Project item not found' });
      const pi = piResult[0];
      if (!pi.itemCode) return res.status(400).json({ error: 'Project item has no item code' });

      // Mark pending
      await db.update(projectItems)
        .set({ sapSyncStatus: 'sync_pending', updatedAt: new Date() } as any)
        .where(eq(projectItems.id, projectItemId));

      let finalStatus: string;
      let sapItemCode: string | null = null;
      let sapSyncError: string | null = null;
      let sapSynced = false;
      let sapSyncedAt: Date | null = null;

      try {
        // Step 1: Check if item exists in SAP
        const checkResp = await sapSession.request({
          method: 'GET',
          path: `/b1s/v1/Items('${encodeURIComponent(pi.itemCode)}')`,
          timeout: 30000,
        });

        if (checkResp.ok) {
          // Already in SAP — mark synced, no create
          finalStatus = 'synced';
          sapItemCode = pi.itemCode;
          sapSynced = true;
          sapSyncedAt = new Date();
          console.log(`[BOM SAP Sync] Item already exists in SAP: ${pi.itemCode}`);
        } else if (checkResp.statusCode === 404) {
          // Not in SAP — create
          const uom = pi.uom || 'Nos';
          const payload: Record<string, any> = {
            ItemCode: pi.itemCode,
            ItemName: (pi.description || pi.itemCode).substring(0, 100),
            ItemsGroupCode: 104,
            SalesUnit: uom,
            PurchaseUnit: uom,
            InventoryUOM: uom,
            ItemType: 'itItems',
          };
          if (pi.codeBars && pi.codeBars.length === 16) payload.BarCode = pi.codeBars;

          const createResp = await sapSession.request({
            method: 'POST',
            path: '/b1s/v1/Items',
            body: payload,
            timeout: 30000,
          });

          if (createResp.ok) {
            finalStatus = 'synced';
            sapItemCode = pi.itemCode;
            sapSynced = true;
            sapSyncedAt = new Date();
            console.log(`[BOM SAP Sync] Item created in SAP: ${pi.itemCode}`);
          } else {
            finalStatus = 'sync_failed';
            sapSyncError = `SAP create failed (${createResp.statusCode}): ${String(createResp.body || '').substring(0, 300)}`;
            console.error(`[BOM SAP Sync] Create failed: ${sapSyncError}`);
          }
        } else {
          finalStatus = 'sync_failed';
          sapSyncError = `SAP check failed (${checkResp.statusCode}): ${String(checkResp.body || '').substring(0, 300)}`;
          console.error(`[BOM SAP Sync] Check failed: ${sapSyncError}`);
        }
      } catch (connErr: any) {
        finalStatus = 'sync_failed';
        sapSyncError = `SAP connection failed: ${connErr.message}`;
        console.error(`[BOM SAP Sync] Connection error:`, connErr);
      }

      await db.update(projectItems)
        .set({
          sapSyncStatus: finalStatus,
          sapSynced,
          sapSyncedAt,
          sapSyncError,
          sapItemCode,
          updatedAt: new Date(),
        } as any)
        .where(eq(projectItems.id, projectItemId));

      return res.json({ success: finalStatus === 'synced', sapSyncStatus: finalStatus, sapItemCode, sapSyncedAt, sapSyncError });
    } catch (error: any) {
      console.error('[BOM SAP Sync] Unexpected error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/projects/:projectId/sap-sync/retry-failed', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const failedItems = await db.select().from(projectItems).where(
        and(
          eq(projectItems.projectId, projectId),
          eq(projectItems.sapSynced, false),
          sql`item_code IS NOT NULL`
        )
      );

      let synced = 0;
      let failed = 0;
      const errors: { itemCode: string; error: string }[] = [];

      for (const pi of failedItems) {
        const result = await syncProjectItemToSap(pi);
        if (result.error) {
          failed++;
          errors.push({ itemCode: pi.itemCode || 'unknown', error: result.error });
        } else {
          synced++;
        }
      }

      res.json({ retried: failedItems.length, synced, failed, errors });
    } catch (error: any) {
      console.error('SAP retry-all error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  console.log('Project Item Detail routes registered at /api/project-items/:id/drawings, /ecr, /ecn, /sap-sync');
}
