import { Router, Request, Response } from 'express';
import { db } from './db';
import multer from 'multer';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { getGcsStorage } from './utils/gcs-storage';

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
      const dispatchRecords = await db.query.dispatch_records.findMany({
        where: eq(db.schema.dispatch_records.project_id, projectId),
        orderBy: [desc(db.schema.dispatch_records.dispatch_date)],
        with: {
          project: true,
          items: {
            with: {
              item: true
            }
          }
        }
      });
      
      res.json(dispatchRecords);
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
      const dispatchRecord = await db.query.dispatch_records.findFirst({
        where: eq(db.schema.dispatch_records.id, dispatchId),
        with: {
          project: true,
          items: {
            with: {
              item: true
            }
          },
          documents: true
        }
      });
      
      if (!dispatchRecord) {
        return res.status(404).json({ error: 'Dispatch record not found' });
      }
      
      res.json(dispatchRecord);
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
      const [newDispatch] = await db.insert(db.schema.dispatch_records).values({
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
        
        await db.insert(db.schema.dispatch_items).values(dispatchItems);
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
      const [updatedDispatch] = await db.update(db.schema.dispatch_records)
        .set({
          transporter_name,
          transporter_contact,
          vehicle_number,
          delivery_status,
          estimated_delivery_date: estimated_delivery_date ? new Date(estimated_delivery_date) : undefined,
          actual_delivery_date: actual_delivery_date ? new Date(actual_delivery_date) : undefined,
          notes
        })
        .where(eq(db.schema.dispatch_records.id, dispatchId))
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
      await db.delete(db.schema.dispatch_records)
        .where(eq(db.schema.dispatch_records.id, dispatchId));
      
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
      const item = await db.query.master_items.findFirst({
        where: eq(db.schema.master_items.id, item_id)
      });
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      // Add the item to the dispatch
      const [newItem] = await db.insert(db.schema.dispatch_items).values({
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
      const [updatedItem] = await db.update(db.schema.dispatch_items)
        .set({
          quantity,
          unit,
          notes
        })
        .where(eq(db.schema.dispatch_items.id, itemId))
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
      await db.delete(db.schema.dispatch_items)
        .where(eq(db.schema.dispatch_items.id, itemId));
      
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
      
      // Verify the dispatch record exists
      const dispatch = await db.query.dispatch_records.findFirst({
        where: eq(db.schema.dispatch_records.id, dispatchId),
        with: {
          project: true
        }
      });
      
      if (!dispatch) {
        return res.status(404).json({ error: 'Dispatch record not found' });
      }
      
      // Get the financial year and project code
      const project = dispatch.project;
      
      // Upload to GCS
      const gcsStorage = getGcsStorage();
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;
      
      // Create the file path in GCS
      const filePath = `THERMOPAC_PROJECTS/${project.financial_year}/${project.code}/Dispatch/${dispatch.dispatch_number}/${document_type}_${fileName}`;
      
      const uploadResult = await gcsStorage.uploadFile(filePath, fileBuffer, req.file.mimetype);
      
      // Add the document to the database
      const [newDocument] = await db.insert(db.schema.dispatch_documents).values({
        dispatch_id: dispatchId,
        document_type,
        document_name: fileName,
        document_path: filePath,
        uploaded_by: req.user!.id,
        storage_path: uploadResult.path,
        storage_url: uploadResult.url,
        storage_url_expiry: uploadResult.expiryTime ? new Date(uploadResult.expiryTime) : null
      }).returning();
      
      res.status(201).json(newDocument);
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
      
      // Get the document
      const document = await db.query.dispatch_documents.findFirst({
        where: eq(db.schema.dispatch_documents.id, documentId)
      });
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Check if the URL is still valid
      const now = new Date();
      if (document.storage_url_expiry && document.storage_url_expiry > now && document.storage_url) {
        return res.json({ url: document.storage_url });
      }
      
      // Generate a new signed URL
      const gcsStorage = getGcsStorage();
      const downloadUrl = await gcsStorage.getSignedUrl(document.storage_path);
      
      // Update the document with the new URL and expiry
      await db.update(db.schema.dispatch_documents)
        .set({
          storage_url: downloadUrl.url,
          storage_url_expiry: downloadUrl.expiryTime ? new Date(downloadUrl.expiryTime) : null
        })
        .where(eq(db.schema.dispatch_documents.id, documentId));
      
      res.json({ url: downloadUrl.url });
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
      const document = await db.query.dispatch_documents.findFirst({
        where: eq(db.schema.dispatch_documents.id, documentId)
      });
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Delete from GCS
      if (document.storage_path) {
        const gcsStorage = getGcsStorage();
        await gcsStorage.deleteFile(document.storage_path);
      }
      
      // Delete from database
      await db.delete(db.schema.dispatch_documents)
        .where(eq(db.schema.dispatch_documents.id, documentId));
      
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
      const transporters = await db.query.transporters.findMany({
        where: eq(db.schema.transporters.is_active, true),
        orderBy: db.schema.transporters.name
      });
      
      res.json(transporters);
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
      const [newTransporter] = await db.insert(db.schema.transporters).values({
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