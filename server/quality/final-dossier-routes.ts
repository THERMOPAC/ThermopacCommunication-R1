import express, { Request, Response } from 'express';
import { generateFinalDossier, checkExistingFinalDossier } from '../utils/final-dossier-generator';
import { listFilesInDirectory } from '../utils/list-gcs-files';

const router = express.Router();

// Middleware to ensure user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: express.NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
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
    const dossierDirPath = `${inspectionDirPath}/Final Dossier`;
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
    
    if (!result.exists || !result.url) {
      return res.status(404).json({ error: 'Final dossier not found' });
    }

    // Redirect to the signed URL
    res.redirect(result.url);
  } catch (error) {
    console.error('Error downloading final dossier:', error);
    res.status(500).json({ 
      error: 'Failed to download final dossier', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;