import storage from './storage-config';
import { format } from 'util';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import multer from 'multer';

// Set up multer storage for temporary file uploads
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = './temp';
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const tempFilename = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, tempFilename);
  }
});

// Configure multer upload middleware
export const uploadWpsPqrDocument = multer({
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDFs and images
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'));
    }
  }
});

/**
 * Uploads a WPS document to Google Cloud Storage
 * @param req Express request object with file data
 * @returns Object with file path and public URL
 */
export const uploadWpsDocument = async (req: Request) => {
  try {
    if (!req.file) {
      return { error: 'No file uploaded' };
    }

    const wpsId = req.body.wpsId || 'unknown';
    const gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
    
    // Path in GCS: QMS/WPS_PQR/[wpsId].pdf
    const gcsFilename = `${wpsId}.pdf`;
    const gcsFilePath = `QMS/WPS_PQR/${gcsFilename}`;
    
    const file = gcsBucket.file(gcsFilePath);
    
    // Upload file to GCS
    const fileStream = fs.createReadStream(req.file.path);
    const writeStream = file.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          originalFilename: req.file.originalname,
          wpsId: wpsId
        }
      }
    });
    
    // Handle upload completion
    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream)
        .on('error', (err) => {
          reject(`Error uploading to GCS: ${err}`);
        })
        .on('finish', () => {
          // Make the file publicly accessible
          file.makePublic()
            .then(() => resolve(true))
            .catch(err => reject(`Error making file public: ${err}`));
        });
    });
    
    // Generate public URL
    const publicUrl = format(`https://storage.googleapis.com/${gcsBucket.name}/${file.name}`);
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);
    
    return {
      success: true,
      document_file_path: gcsFilePath,
      document_url: publicUrl
    };
  } catch (error) {
    console.error('WPS document upload error:', error);
    
    // Cleanup temp file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return {
      error: `Failed to upload document: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Uploads a combined WPS/PQR document to Google Cloud Storage
 * @param req Express request object with file data
 * @returns Object with file path and public URL
 */
export const uploadCombinedDocument = async (req: Request) => {
  try {
    if (!req.file) {
      return { error: 'No file uploaded' };
    }

    // Get WPS ID and PQR ID from request body
    const wpsId = req.body.wpsId;
    const pqrId = req.body.pqrId;
    
    if (!wpsId || !pqrId) {
      return { error: 'WPS ID and PQR ID are required' };
    }

    const gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
    
    // Path in GCS: QMS/WPS_PQR/[wpsId]_[pqrId].pdf
    const gcsFilename = `${wpsId}_${pqrId}.pdf`;
    const gcsFilePath = `QMS/WPS_PQR/${gcsFilename}`;
    
    const file = gcsBucket.file(gcsFilePath);
    
    // Upload file to GCS
    const fileStream = fs.createReadStream(req.file.path);
    const writeStream = file.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          originalFilename: req.file.originalname,
          wpsId: wpsId,
          pqrId: pqrId,
          documentType: 'combined'
        }
      }
    });
    
    // Handle upload completion
    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream)
        .on('error', (err) => {
          reject(`Error uploading to GCS: ${err}`);
        })
        .on('finish', () => {
          // Make the file publicly accessible
          file.makePublic()
            .then(() => resolve(true))
            .catch(err => reject(`Error making file public: ${err}`));
        });
    });
    
    // Generate public URL
    const publicUrl = format(`https://storage.googleapis.com/${gcsBucket.name}/${file.name}`);
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);
    
    return {
      success: true,
      wpsId,
      pqrId,
      combined_document_file_path: gcsFilePath,
      combined_document_url: publicUrl
    };
  } catch (error) {
    console.error('Combined document upload error:', error);
    
    // Cleanup temp file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return {
      error: `Failed to upload combined document: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};