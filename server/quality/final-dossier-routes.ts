import express, { Request, Response, NextFunction } from 'express';
import { generateFinalDossier, checkExistingFinalDossier } from '../utils/final-dossier-generator';
import { listFilesInDirectory } from '../utils/list-gcs-files';

const router = express.Router();

// Test endpoint to verify API routing is working
router.get('/test', (req: Request, res: Response) => {
  console.log('Final Dossier test endpoint hit!');
  res.json({ 
    message: 'Final Dossier API routes are working correctly',
    timestamp: new Date().toISOString() 
  });
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // More flexible authentication check that handles different session states
  if (req.user || (req.isAuthenticated && req.isAuthenticated()) || req.session?.passport?.user) {
    return next();
  }
  console.log('Authentication failed in final-dossier-routes. Req.user:', !!req.user, 'isAuthenticated:', typeof req.isAuthenticated, 'session user:', !!req.session?.passport?.user);
  res.status(401).json({ error: 'Not authenticated' });
}

// Generate a final dossier for an inspection order
router.post('/generate/:inspectionOrderId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const inspectionOrderId = parseInt(req.params.inspectionOrderId);
    
    if (isNaN(inspectionOrderId)) {
      return res.status(400).json({ error: 'Invalid inspection order ID' });
    }
    
    console.log(`Generating final dossier for inspection order ID: ${inspectionOrderId}`);
    
    const result = await generateFinalDossier(inspectionOrderId);
    
    res.json({
      success: true,
      message: 'Final dossier generated successfully',
      url: result.url,
      path: result.path
    });
  } catch (error) {
    console.error('Error generating final dossier:', error);
    res.status(500).json({ 
      error: 'Failed to generate final dossier', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Check if a final dossier exists for an inspection order
router.get('/check/:inspectionOrderNumber', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const inspectionOrderNumber = req.params.inspectionOrderNumber;
    
    if (!inspectionOrderNumber) {
      return res.status(400).json({ error: 'Invalid inspection order number' });
    }
    
    console.log(`Checking for existing final dossier for inspection order: ${inspectionOrderNumber}`);
    
    const result = await checkExistingFinalDossier(inspectionOrderNumber);
    
    res.json({
      exists: result.exists,
      url: result.url,
      path: result.path
    });
  } catch (error) {
    console.error('Error checking for final dossier:', error);
    res.status(500).json({ 
      error: 'Failed to check for final dossier', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// List files in the Final Dossier directory for an inspection order
router.get('/list-directory/:inspectionOrderNumber', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const inspectionOrderNumber = req.params.inspectionOrderNumber;
    
    if (!inspectionOrderNumber) {
      return res.status(400).json({ error: 'Invalid inspection order number' });
    }
    
    // Check main inspection records directory
    console.log(`Listing files in QMS/Inspections_Records directory for inspection order: ${inspectionOrderNumber}`);
    const inspectionDirPath = `QMS/Inspections_Records/${inspectionOrderNumber}`;
    const files = await listFilesInDirectory(inspectionDirPath);
    
    // Also check the specific Final Dossier subdirectory
    const dossierDirPath = `${inspectionDirPath}/Final_Dossier`;
    let dossierFiles: string[] = [];
    try {
      dossierFiles = await listFilesInDirectory(dossierDirPath);
    } catch (e) {
      console.log(`No Final Dossier directory found for ${inspectionOrderNumber}`);
    }
    
    // Check 1 level up in case there's a path issue
    const qmsDirPath = 'QMS/Inspections_Records';
    const qmsFiles = await listFilesInDirectory(qmsDirPath);
    
    // Also check just "QMS" to see what directories exist
    const baseQmsDirPath = 'QMS';
    const baseQmsFiles = await listFilesInDirectory(baseQmsDirPath);
    
    res.json({
      inspectionFiles: files,
      dossierFiles: dossierFiles,
      qmsDirectoryFiles: qmsFiles,
      baseQmsFiles: baseQmsFiles,
      expectedDossierPath: `${dossierDirPath}/FD_${inspectionOrderNumber}.pdf`
    });
  } catch (error) {
    console.error('Error listing files in GCS directory:', error);
    res.status(500).json({ 
      error: 'Failed to list files', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});


// Download/view a final dossier PDF
router.get('/download/:inspectionOrderId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const inspectionOrderId = parseInt(req.params.inspectionOrderId);
    
    if (isNaN(inspectionOrderId)) {
      return res.status(400).json({ error: 'Invalid inspection order ID' });
    }

    console.log(`Downloading final dossier for inspection order ID: ${inspectionOrderId}`);
    
    // Check if final dossier exists
    const result = await checkExistingFinalDossier(inspectionOrderId);
    console.log('Check result:', result);
    
    if (!result.exists) {
      return res.status(404).json({ error: 'Final dossier not found' });
    }

    // If we have a signed URL, use it
    if (result.url) {
      return res.redirect(result.url);
    }

    // If no signed URL but file exists, try to generate one on-demand
    if (result.path) {
      try {
        const { initializeGCS } = await import('../utils/gcs-operations.js');
        const { bucket } = await initializeGCS();
        
        if (!bucket) {
          throw new Error('Failed to initialize GCS bucket');
        }
        
        console.log(`Attempting to generate signed URL for: ${result.path}`);
        
        const [signedUrl] = await bucket.file(result.path).getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour expiry for immediate download
        });
        
        console.log('Successfully generated on-demand signed URL');
        return res.redirect(signedUrl);
      } catch (signedUrlError) {
        console.error('Failed to generate on-demand signed URL:', signedUrlError);
        // Fall back to serving file content directly
        try {
          const { initializeGCS } = await import('../utils/gcs-operations.js');
          const { bucket } = await initializeGCS();
          
          if (!bucket) {
            throw new Error('Failed to initialize GCS bucket for streaming');
          }
          
          console.log(`Attempting to stream file directly: ${result.path}`);
          
          const file = bucket.file(result.path);
          const [exists] = await file.exists();
          
          if (!exists) {
            return res.status(404).json({ error: 'File not found in storage' });
          }
          
          // Set appropriate headers for PDF
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="Final_Dossier.pdf"`);
          
          // Stream the file directly
          file.createReadStream()
            .on('error', (streamError) => {
              console.error('Error streaming file:', streamError);
              if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming file' });
              }
            })
            .pipe(res);
            
          return; // Don't send additional response
        } catch (streamError) {
          console.error('Failed to stream file directly:', streamError);
          return res.status(500).json({ error: 'Unable to access file' });
        }
      }
    }

    return res.status(404).json({ error: 'Final dossier file path not available' });
  } catch (error) {
    console.error('Error downloading final dossier:', error);
    res.status(500).json({ 
      error: 'Failed to download final dossier', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Alternative download route for path-based downloads (fallback mechanism)
router.get('/download/*', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Extract the full path from the URL (everything after /download/)
    const fullPath = req.params[0];
    
    if (!fullPath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    console.log(`Path-based download for: ${fullPath}`);
    
    try {
      const { initializeGCS } = await import('../utils/gcs-operations.js');
      const { bucket } = await initializeGCS();
      
      if (!bucket) {
        return res.status(500).json({ error: 'Failed to initialize GCS bucket' });
      }
      
      // Check if file exists
      const file = bucket.file(fullPath);
      const [exists] = await file.exists();
      
      if (!exists) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      
      // Try to generate signed URL first
      try {
        console.log(`Attempting to generate signed URL for: ${fullPath}`);
        
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour expiry
        });
        
        console.log('Successfully generated signed URL');
        return res.redirect(signedUrl);
      } catch (signedUrlError) {
        console.error('Failed to generate signed URL, streaming directly:', signedUrlError);
        
        // Fall back to streaming file directly
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Final_Dossier.pdf"`);
        
        // Stream the file directly
        file.createReadStream()
          .on('error', (streamError) => {
            console.error('Error streaming file:', streamError);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Error streaming file' });
            }
          })
          .pipe(res);
          
        return; // Don't send additional response
      }
    } catch (gcsError) {
      console.error('GCS error:', gcsError);
      return res.status(500).json({ error: 'Storage access error' });
    }
  } catch (error) {
    console.error('Error in path-based download:', error);
    res.status(500).json({ 
      error: 'Failed to download file', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Debug endpoint to troubleshoot specific inspection order
router.get('/debug/:inspectionOrderId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const inspectionOrderId = parseInt(req.params.inspectionOrderId);
    
    if (isNaN(inspectionOrderId)) {
      return res.status(400).json({ error: 'Invalid inspection order ID' });
    }

    console.log(`🐛 DEBUG: Final dossier troubleshooting for inspection order ID: ${inspectionOrderId}`);
    
    // Get the inspection order details
    const { db } = await import('../storage.js');
    const { inspectionOrders } = await import('../../shared/schema.js');
    const { eq } = await import('drizzle-orm');
    
    const inspectionOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, inspectionOrderId)
    });
    
    if (!inspectionOrder) {
      return res.json({
        error: 'Inspection order not found',
        inspectionOrderId,
        foundInDatabase: false
      });
    }

    // Check if final dossier exists
    const result = await checkExistingFinalDossier(inspectionOrderId);
    
    // Generate expected paths
    const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final_Dossier/`;
    const expectedFileName = `FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
    const expectedFilePath = `${basePath}${expectedFileName}`;
    
    // Try to list directory contents for additional debugging
    let directoryContents = [];
    try {
      directoryContents = await listFilesInDirectory(basePath);
    } catch (e) {
      console.log('Could not list directory contents:', e);
    }
    
    res.json({
      inspectionOrderId,
      foundInDatabase: true,
      inspectionOrder: {
        id: inspectionOrder.id,
        inspectionOrderNumber: inspectionOrder.inspectionOrderNumber,
        projectCode: inspectionOrder.projectCode,
        title: inspectionOrder.title
      },
      expectedGCSPath: {
        basePath,
        expectedFileName,
        expectedFilePath
      },
      checkResult: result,
      directoryContents: directoryContents.map(f => f.name),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ 
      error: 'Debug endpoint failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Download a Final Dossier document by file path (query parameter version for InspectionDocumentViewer)
router.get('/download', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const filePath = req.query.filePath as string;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    console.log(`Downloading Final Dossier document from path: ${filePath}`);
    
    const { initializeGCS } = await import('../utils/gcs-operations');
    const { storage, bucket } = await initializeGCS();
    
    if (!storage || !bucket) {
      return res.status(500).json({ error: 'GCS storage not available' });
    }
    
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      return res.status(404).json({ error: 'Final Dossier document not found' });
    }
    
    // Get file metadata
    const [metadata] = await file.getMetadata();
    const fileName = filePath.split('/').pop() || 'final_dossier.pdf';
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', metadata.size || '0');
    
    // Stream the file
    const stream = file.createReadStream();
    stream.pipe(res);
    
    stream.on('error', (error) => {
      console.error('Error streaming Final Dossier document:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download document' });
      }
    });
    
  } catch (error) {
    console.error('Error downloading Final Dossier document:', error);
    res.status(500).json({ 
      error: 'Failed to download Final Dossier document', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Delete a Final Dossier document by file path (query parameter version for InspectionDocumentViewer)
router.delete('/delete', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const filePath = req.query.filePath as string;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    console.log(`Deleting Final Dossier document from path: ${filePath}`);
    
    const { initializeGCS } = await import('../utils/gcs-operations');
    const { storage, bucket } = await initializeGCS();
    
    if (!storage || !bucket) {
      return res.status(500).json({ error: 'GCS storage not available' });
    }
    
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      return res.status(404).json({ error: 'Final Dossier document not found' });
    }
    
    // Delete the file
    await file.delete();
    
    console.log(`Successfully deleted Final Dossier document: ${filePath}`);
    
    res.json({
      success: true,
      message: 'Final Dossier document deleted successfully',
      filePath: filePath
    });
    
  } catch (error) {
    console.error('Error deleting Final Dossier document:', error);
    res.status(500).json({ 
      error: 'Failed to delete Final Dossier document', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;