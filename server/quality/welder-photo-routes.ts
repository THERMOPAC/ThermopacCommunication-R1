import express, { Request, Response } from 'express';
import multer from 'multer';
import { uploadWelderPhoto, getWelderPhotoUrl } from '../utils/welder-photo-upload';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  }
});

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

// Register routes
export function registerWelderPhotoRoutes(app: express.Router) {
  // Upload welder photo
  app.post('/api/upload/welder-photo', 
    ensureAuthenticated,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { buffer, originalname, mimetype } = req.file;
        // Welder ID is now required for the new directory structure
        if (!req.body.welderId) {
          return res.status(400).json({ error: 'Welder ID is required for photo upload' });
        }
        
        // Get the welder ID
        const welderId = req.body.welderId;
        console.log(`Processing photo upload for welder ID: ${welderId}`);

        // Upload the file to GCS
        const result = await uploadWelderPhoto(
          buffer,
          originalname,
          mimetype,
          welderId
        );

        if (!result.success) {
          return res.status(500).json({ error: 'Failed to upload photo' });
        }

        // If a welder ID was provided, update the welder record with the photo path
        if (welderId && welderId.trim() !== '') {
          try {
            // Try to parse welder ID as number (numeric database ID)
            const welderDbId = parseInt(req.body.welderId);
            
            console.log(`Attempting to update photoPath in database for welder ID: ${welderDbId}, path: ${result.filePath}`);
            
            if (!isNaN(welderDbId)) {
              // Update the database with the new photo path
              await db.update(schema.welders)
                .set({ photoPath: result.filePath })
                .where(eq(schema.welders.id, welderDbId));
                
              console.log(`Successfully updated welder record ${welderDbId} with photo path: ${result.filePath}`);
            } else {
              console.error(`Invalid welder ID format for database update: ${req.body.welderId}`);
            }
          } catch (dbError) {
            console.error('Error updating welder record with photo path:', dbError);
            // Continue even if update fails, as we still want to return the upload result
          }
        }

        res.status(200).json({
          success: true,
          path: result.filePath,
          url: result.url
        });
      } catch (error) {
        console.error('Error in welder photo upload route:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get welder photo URL
  app.get('/api/welder-photos/:welderId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const welderId = parseInt(req.params.welderId);
      
      if (isNaN(welderId)) {
        return res.status(400).json({ error: 'Invalid welder ID' });
      }
      
      // Get the welder from the database
      const [welder] = await db.select().from(schema.welders).where(eq(schema.welders.id, welderId));
      
      if (!welder) {
        return res.status(404).json({ error: 'Welder not found' });
      }
      
      if (!welder.photoPath) {
        return res.status(404).json({ error: 'No photo available for this welder' });
      }
      
      // Generate a signed URL for the photo
      const photoUrl = await getWelderPhotoUrl(welder.photoPath);
      
      if (!photoUrl) {
        return res.status(404).json({ error: 'Photo file not found or inaccessible' });
      }
      
      res.status(200).json({ url: photoUrl });
    } catch (error) {
      console.error('Error getting welder photo URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  console.log('Welder photo routes registered');
}