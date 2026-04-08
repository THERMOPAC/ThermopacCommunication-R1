import { Router, Request, Response } from 'express';
import { db } from './db';
import multer from 'multer';
import crypto from 'crypto';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { gcsStorage } from './utils/gcs-storage';
import { initializeGCS } from './utils/gcs-operations';
import { dispatchRecords, dispatchItems, dispatchDocuments, transporters, masterItems, projects, epcDocumentAttachments, epcDocumentAccessLog } from '@shared/schema';
import * as epcCoding from './epc-coding';
import { isFeatureFlagEnabled, findEpcDispatchRecord, resolveDispatchDocumentWithFallback } from './utils/epc-migration-helpers';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

function canManage(role: string): boolean {
  return ['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(role);
}

export function setupDispatchRoutes(app: Router) {
  const storage = multer.memoryStorage();
  const upload = multer({ storage });
  
  /**
   * Get all dispatch records for a project
   */
  app.get('/api/dispatch/project/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get all dispatch records for the project
      const dispatchList = await db.select().from(dispatchRecords)
        .where(eq(dispatchRecords.project_id, projectId))
        .orderBy(desc(dispatchRecords.dispatch_date));
        
      // For each dispatch record, load related items
      const enhancedDispatchList = await Promise.all(dispatchList.map(async (dispatch) => {
        // Get items for this dispatch
        const items = await db.select().from(dispatchItems)
          .where(eq(dispatchItems.dispatch_id, dispatch.id));
          
        // Return dispatch with items
        return {
          ...dispatch,
          items
        };
      }));
      
      res.json(enhancedDispatchList);
    } catch (error) {
      console.error('Error fetching dispatch records:', error);
      res.status(500).json({ error: 'Failed to fetch dispatch records' });
    }
  });

  /**
   * Get a specific dispatch record
   */
  app.get('/api/dispatch/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      
      // Get the dispatch record
      const dispatchRecordResult = await db.select().from(dispatchRecords).where(eq(dispatchRecords.id, dispatchId)).limit(1);
      
      if (!dispatchRecordResult || dispatchRecordResult.length === 0) {
        return res.status(404).json({ error: 'Dispatch record not found' });
      }
      
      const dispatchRecord = dispatchRecordResult[0];
      
      // Get related items separately
      const items = await db.select().from(dispatchItems)
        .where(eq(dispatchItems.dispatch_id, dispatchId));
        
      // Get related documents
      const documents = await db.select().from(dispatchDocuments)
        .where(eq(dispatchDocuments.dispatch_id, dispatchId));
      
      // Combine the data
      const result = {
        ...dispatchRecord,
        items,
        documents
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching dispatch record:', error);
      res.status(500).json({ error: 'Failed to fetch dispatch record' });
    }
  });

  /**
   * Create a new dispatch record
   */
  app.post('/api/dispatch', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const { 
        project_id, 
        dispatch_number, 
        dispatch_date, 
        transporter_name, 
        transporter_contact,
        vehicle_number,
        gate_pass_number,
        delivery_status,
        estimated_delivery_date,
        items,
        notes
      } = req.body;
      
      // Check if all items are quality approved
      const qualityNotApproved = items.filter((item: any) => !item.quality_approved);
      if (qualityNotApproved.length > 0) {
        return res.status(400).json({ 
          error: 'Some items have not been quality approved', 
          items: qualityNotApproved 
        });
      }
      
      // Create the dispatch record
      const [newDispatch] = await db.insert(dispatchRecords).values({
        project_id,
        dispatch_number,
        dispatch_date: new Date(dispatch_date),
        transporter_name,
        transporter_contact,
        vehicle_number,
        gate_pass_number,
        delivery_status: delivery_status || 'Pending',
        estimated_delivery_date: estimated_delivery_date ? new Date(estimated_delivery_date) : null,
        notes,
        created_by: req.user.id
      }).returning();
      
      // Add the items to the dispatch
      if (items && items.length > 0) {
        const dispatchItems = items.map((item: any) => ({
          dispatch_id: newDispatch.id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit: item.unit,
          quality_approved: true,
          quality_approval_date: new Date(),
          quality_approved_by: req.user!.id,
          notes: item.notes
        }));
        
        await db.insert(dispatchItems).values(dispatchItems);
      }
      
      res.status(201).json(newDispatch);
    } catch (error) {
      console.error('Error creating dispatch record:', error);
      res.status(500).json({ error: 'Failed to create dispatch record' });
    }
  });

  /**
   * Update a dispatch record
   */
  app.put('/api/dispatch/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const dispatchId = parseInt(req.params.id);
      const { 
        transporter_name, 
        transporter_contact,
        vehicle_number,
        delivery_status,
        estimated_delivery_date,
        actual_delivery_date,
        notes
      } = req.body;
      
      // Update the dispatch record
      const [updatedDispatch] = await db.update(dispatchRecords)
        .set({
          transporter_name,
          transporter_contact,
          vehicle_number,
          delivery_status,
          estimated_delivery_date: estimated_delivery_date ? new Date(estimated_delivery_date) : undefined,
          actual_delivery_date: actual_delivery_date ? new Date(actual_delivery_date) : undefined,
          notes
        })
        .where(eq(dispatchRecords.id, dispatchId))
        .returning();
      
      if (!updatedDispatch) {
        return res.status(404).json({ error: 'Dispatch record not found' });
      }
      
      res.json(updatedDispatch);
    } catch (error) {
      console.error('Error updating dispatch record:', error);
      res.status(500).json({ error: 'Failed to update dispatch record' });
    }
  });

  /**
   * Delete a dispatch record
   */
  app.delete('/api/dispatch/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const dispatchId = parseInt(req.params.id);
      
      // Delete the dispatch record
      await db.delete(dispatchRecords)
        .where(eq(dispatchRecords.id, dispatchId));
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting dispatch record:', error);
      res.status(500).json({ error: 'Failed to delete dispatch record' });
    }
  });

  /**
   * Add an item to a dispatch record
   */
  app.post('/api/dispatch/:id/items', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const dispatchId = parseInt(req.params.id);
      const { item_id, quantity, unit, notes } = req.body;
      
      // Verify the item exists
      const itemResult = await db.select().from(masterItems).where(eq(masterItems.id, item_id)).limit(1);
      const item = itemResult && itemResult.length > 0 ? itemResult[0] : null;
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      // Add the item to the dispatch
      const [newItem] = await db.insert(dispatchItems).values({
        dispatch_id: dispatchId,
        item_id,
        quantity,
        unit,
        quality_approved: true,
        quality_approval_date: new Date(),
        quality_approved_by: req.user!.id,
        notes
      }).returning();
      
      res.status(201).json(newItem);
    } catch (error) {
      console.error('Error adding item to dispatch:', error);
      res.status(500).json({ error: 'Failed to add item to dispatch' });
    }
  });

  /**
   * Update a dispatch item
   */
  app.put('/api/dispatch/items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const itemId = parseInt(req.params.id);
      const { quantity, unit, notes } = req.body;
      
      // Update the dispatch item
      const [updatedItem] = await db.update(dispatchItems)
        .set({
          quantity,
          unit,
          notes
        })
        .where(eq(dispatchItems.id, itemId))
        .returning();
      
      if (!updatedItem) {
        return res.status(404).json({ error: 'Dispatch item not found' });
      }
      
      res.json(updatedItem);
    } catch (error) {
      console.error('Error updating dispatch item:', error);
      res.status(500).json({ error: 'Failed to update dispatch item' });
    }
  });

  /**
   * Delete a dispatch item
   */
  app.delete('/api/dispatch/items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const itemId = parseInt(req.params.id);
      
      // Delete the dispatch item
      await db.delete(dispatchItems)
        .where(eq(dispatchItems.id, itemId));
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting dispatch item:', error);
      res.status(500).json({ error: 'Failed to delete dispatch item' });
    }
  });

  /**
   * Upload a document for a dispatch record
   */
  app.post('/api/dispatch/:id/documents', ensureAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const dispatchId = parseInt(req.params.id);
      const { document_type } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const dispatch = await db.select().from(dispatchRecords).where(eq(dispatchRecords.id, dispatchId)).limit(1);
      
      if (!dispatch || dispatch.length === 0) {
        return res.status(404).json({ error: 'Dispatch record not found' });
      }
      
      const projectResult = await db.select().from(projects).where(eq(projects.id, dispatch[0].project_id)).limit(1);
      
      if (!projectResult || projectResult.length === 0) {
        return res.status(404).json({ error: 'Project not found for this dispatch record' });
      }
      
      const project = projectResult[0];
      const fileName = req.file.originalname;
      const dispatchNumber = dispatch[0].dispatch_number;
      const userId = req.user!.id;

      const dspCutoverEnabled = await isFeatureFlagEnabled('EPC_UPLOAD_CUTOVER_DSP');
      const epcDispatch = dspCutoverEnabled
        ? await findEpcDispatchRecord(dispatchNumber, project.id)
        : null;

      if (dspCutoverEnabled && epcDispatch && project.code) {
        const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        const documentNumber = epcDispatch.dispatch_number;

        const dupCheck = await db.execute(
          sql`SELECT id, attachment_label FROM epc_document_attachments
              WHERE document_number = ${documentNumber}
              AND doc_type = 'DSP'
              AND checksum_sha256 = ${checksum}
              AND status = 'active'`
        );

        if (dupCheck.rows.length > 0) {
          const dup = dupCheck.rows[0] as any;
          return res.status(409).json({
            error: 'This exact file is already attached to this dispatch record.',
            existingAttachmentId: dup.id,
          });
        }

        const { storage, bucket } = await initializeGCS();
        if (!storage || !bucket) {
          return res.status(500).json({ error: 'Failed to initialize Google Cloud Storage' });
        }

        const geo = await epcCoding.resolveProjectGeoCodes(project.id);

        const txResult = await db.transaction(async (tx) => {
          const seqResult = await tx.execute(
            sql`SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
                FROM epc_document_attachments
                WHERE document_number = ${documentNumber}
                AND revision_code IS NULL`
          );
          const attachmentSeq = (seqResult.rows[0] as any).next_seq;
          const attachmentLabel = (document_type || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-');

          const gcsObjectPath = epcCoding.buildEpcGcsPath(
            geo.continentCode, geo.countryCode, geo.customerShortCode, geo.fyCode,
            geo.projectSeq, 'DSP', documentNumber,
            null, attachmentSeq, attachmentLabel, fileName
          );

          const [inserted] = await tx.insert(epcDocumentAttachments).values({
            parentEntityType: 'epc_dispatch_records',
            parentEntityId: epcDispatch.id,
            projectId: project.id,
            docType: 'DSP',
            documentNumber,
            isRevisionControlled: false,
            revisionCode: null,
            attachmentLabel,
            attachmentSeq,
            gcsBucket: 'thermopac_storage',
            gcsObjectPath,
            originalFileName: fileName,
            mimeType: req.file!.mimetype,
            fileSizeBytes: req.file!.size,
            checksumSha256: checksum,
            status: 'active',
            isCurrent: true,
            uploadedBy: userId,
          }).returning();

          await tx.execute(sql`
            INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
            VALUES (${project.id}, 'epc_document.uploaded', ${JSON.stringify({
              attachmentId: inserted.id, documentNumber, docType: 'DSP',
              originalFileName: fileName, mimeType: req.file!.mimetype,
              fileSizeBytes: req.file!.size, checksumSha256: checksum,
              gcsObjectPath, uploadedBy: userId,
            })}::jsonb, 'dispatch_document_upload', NOW())
          `);

          return { inserted, attachmentSeq, gcsObjectPath };
        });

        const gcsFile = bucket.file(txResult.gcsObjectPath);
        await gcsFile.save(req.file.buffer, {
          contentType: req.file.mimetype,
          metadata: {
            metadata: {
              documentNumber, docType: 'DSP', revisionCode: 'na',
              projectId: String(project.id), uploadedBy: String(userId),
              checksumSha256: checksum,
            },
          },
        });

        await db.insert(epcDocumentAccessLog).values({
          attachmentId: txResult.inserted.id,
          documentNumber,
          revisionCode: null,
          docType: 'DSP',
          projectId: project.id,
          action: 'upload',
          accessedBy: userId,
          ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
          userAgent: (req.headers['user-agent'] || '').substring(0, 500),
        });

        const [newDocument] = await db.insert(dispatchDocuments).values({
          dispatch_id: dispatchId,
          document_type,
          document_name: fileName,
          document_path: txResult.gcsObjectPath,
          uploaded_by: userId,
          storage_path: txResult.gcsObjectPath,
          storage_url: null,
          storage_url_expiry: null
        }).returning();

        console.log(`[DSP-EPC] Uploaded ${documentNumber} DSP seq ${txResult.attachmentSeq} by user ${userId}`);
        res.status(201).json({
          ...newDocument,
          epcAttachmentId: txResult.inserted.id,
          epcPath: txResult.gcsObjectPath,
          uploadRoute: 'epc',
        });
      } else {
        const filePath = `THERMOPAC_PROJECTS/${project.financialYear}/${project.code}/Dispatch/${dispatchNumber}/${document_type}_${fileName}`;

        await gcsStorage.ensureDirectoryStructure(`THERMOPAC_PROJECTS/${project.financialYear}/${project.code}/Dispatch/${dispatchNumber}`);

        const uploadUrl = await gcsStorage.generateUploadSignedUrl({
          financialYear: project.financialYear,
          projectCode: project.code,
          department: 'Dispatch',
          subDirectory: dispatchNumber,
          fileName: `${document_type}_${fileName}`,
          contentType: req.file.mimetype
        });

        const uploadResult = {
          path: filePath,
          url: uploadUrl,
          expiryTime: Date.now() + 15 * 60 * 1000
        };

        const [newDocument] = await db.insert(dispatchDocuments).values({
          dispatch_id: dispatchId,
          document_type,
          document_name: fileName,
          document_path: filePath,
          uploaded_by: userId,
          storage_path: uploadResult.path,
          storage_url: uploadResult.url,
          storage_url_expiry: uploadResult.expiryTime ? new Date(uploadResult.expiryTime) : null
        }).returning();

        console.log(`[DSP-LEGACY] Uploaded dispatch doc for ${dispatchNumber} by user ${userId}`);
        res.status(201).json({ ...newDocument, uploadRoute: 'legacy' });
      }
    } catch (error) {
      console.error('Error uploading dispatch document:', error);
      res.status(500).json({ error: 'Failed to upload dispatch document' });
    }
  });

  /**
   * Get download URL for a dispatch document
   */
  app.get('/api/dispatch/documents/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const documentResult = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, documentId)).limit(1);
      
      if (!documentResult || documentResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const document = documentResult[0];

      if (!document.storage_path) {
        return res.status(404).json({ error: 'Document path not found' });
      }

      const dispatchResult = await db.select().from(dispatchRecords).where(eq(dispatchRecords.id, document.dispatch_id)).limit(1);
      const dispatchNumber = dispatchResult.length > 0 ? dispatchResult[0].dispatch_number : null;
      const projectId = dispatchResult.length > 0 ? dispatchResult[0].project_id : null;

      let downloadUrl: string | null = null;
      let downloadSource: 'epc' | 'legacy' = 'legacy';

      if (dispatchNumber && projectId) {
        const resolved = await resolveDispatchDocumentWithFallback(
          document.id,
          document.storage_path,
          projectId,
          dispatchNumber,
          userId
        );

        if (resolved.source === 'epc') {
          const { storage, bucket } = await initializeGCS();
          if (storage && bucket) {
            const gcsFile = bucket.file(resolved.path);
            const [signedUrl] = await gcsFile.getSignedUrl({
              action: 'read' as const,
              expires: Date.now() + 15 * 60 * 1000,
            });
            downloadUrl = signedUrl;
            downloadSource = 'epc';

            await db.insert(epcDocumentAccessLog).values({
              attachmentId: resolved.attachmentId!,
              documentNumber: dispatchNumber,
              revisionCode: null,
              docType: 'DSP',
              projectId,
              action: 'download',
              accessedBy: userId,
              ipAddress: (req.ip || req.socket.remoteAddress || '').substring(0, 45),
              userAgent: (req.headers['user-agent'] || '').substring(0, 500),
            });
          }
        }
      }

      if (!downloadUrl) {
        const now = new Date();
        if (document.storage_url_expiry && document.storage_url_expiry > now && document.storage_url) {
          return res.json({ url: document.storage_url, source: 'legacy_cached' });
        }

        downloadUrl = await gcsStorage.generateDownloadSignedUrl({
          filePath: document.storage_path
        });

        if (!downloadUrl) {
          return res.status(404).json({ error: 'Could not generate download URL for file' });
        }

        await db.update(dispatchDocuments)
          .set({
            storage_url: downloadUrl,
            storage_url_expiry: new Date(Date.now() + 15 * 60 * 1000)
          })
          .where(eq(dispatchDocuments.id, documentId));
      }
      
      res.json({ url: downloadUrl, source: downloadSource });
    } catch (error) {
      console.error('Error getting download URL:', error);
      res.status(500).json({ error: 'Failed to get download URL' });
    }
  });

  /**
   * Delete a dispatch document
   */
  app.delete('/api/dispatch/documents/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const documentId = parseInt(req.params.id);
      
      // Get the document
      const documentResult = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, documentId)).limit(1);
      
      if (!documentResult || documentResult.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const document = documentResult[0];
      
      // Delete from GCS
      if (document.storage_path) {
        await gcsStorage.deleteFile(document.storage_path);
      }
      
      // Delete from database
      await db.delete(dispatchDocuments)
        .where(eq(dispatchDocuments.id, documentId));
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting dispatch document:', error);
      res.status(500).json({ error: 'Failed to delete dispatch document' });
    }
  });

  /**
   * Get all transporters
   */
  app.get('/api/transporters', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const transporterList = await db.select().from(transporters).where(eq(transporters.is_active, true)).orderBy(transporters.name);
      
      res.json(transporterList);
    } catch (error) {
      console.error('Error fetching transporters:', error);
      res.status(500).json({ error: 'Failed to fetch transporters' });
    }
  });

  /**
   * Create a new transporter
   */
  app.post('/api/transporters', ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user || !canManage(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    try {
      const { name, contact_person, email, phone, address, gst_number } = req.body;
      
      // Create the transporter
      const [newTransporter] = await db.insert(transporters).values({
        name,
        contact_person,
        email,
        phone,
        address,
        gst_number,
        is_active: true
      }).returning();
      
      res.status(201).json(newTransporter);
    } catch (error) {
      console.error('Error creating transporter:', error);
      res.status(500).json({ error: 'Failed to create transporter' });
    }
  });
}