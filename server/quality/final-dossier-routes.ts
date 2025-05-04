import express, { Request, Response } from 'express';
import { generateFinalDossier, checkExistingFinalDossier } from '../utils/final-dossier-generator';

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

export default router;