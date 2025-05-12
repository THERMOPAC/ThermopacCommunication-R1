import { Request, Response, Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCalibrationCertificate } from '../utils/calibration-certificate-upload';

// Create router
const router = Router();

// Set up multer for memory storage
const memoryStorage = multer.memoryStorage();
const upload = multer({ 
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Authentication middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Simple test endpoint for file uploads
 * This endpoint bypasses the complexity of the main calibration routes
 * and focuses only on the file upload part
 */
router.post('/upload-test', ensureAuthenticated, async (req: Request, res: Response) => {
  console.log("TEST ENDPOINT: Starting upload test");
  
  try {
    // Process the upload with promise wrapper
    const processUpload = () => {
      return new Promise((resolve, reject) => {
        upload.single('file')(req, res, (err) => {
          if (err) {
            console.log("TEST ENDPOINT: Multer error", err);
            return reject(err);
          }
          resolve(true);
        });
      });
    };
    
    // Start upload processing
    await processUpload();
    
    // Check if we have a file
    if (!req.file) {
      console.log("TEST ENDPOINT: No file in request");
      return res.status(400).json({
        error: 'No file uploaded',
        success: false
      });
    }
    
    // Log file info
    console.log("TEST ENDPOINT: File received", {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    
    // Upload to GCS
    const testUploadResult = await uploadCalibrationCertificate(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'TEST-' + Date.now()
    );
    
    console.log("TEST ENDPOINT: Upload result", testUploadResult);
    
    // Return success response
    return res.json({
      success: true,
      message: 'File processed successfully',
      fileName: req.file.originalname,
      filePath: testUploadResult.filePath,
      fileUrl: testUploadResult.url
    });
    
  } catch (error) {
    console.error("TEST ENDPOINT: Error processing file", error);
    return res.status(500).json({
      error: 'Failed to process file',
      details: error instanceof Error ? error.message : String(error),
      success: false
    });
  }
});

export default router;