import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { debugInspectionOrderGeneration } from './inspection-order-debug';

const debugRouter = Router();

/**
 * Debug inspection order generation for a project
 */
debugRouter.get('/inspection-orders/debug/:projectId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    // Run the debug function
    await debugInspectionOrderGeneration(projectId);
    
    return res.status(200).json({ 
      message: 'Debug completed. Check server logs for detailed output.',
      projectId
    });
  } catch (error: any) {
    console.error('Error during inspection order debug:', error);
    return res.status(500).json({ 
      error: 'Error during inspection order debug', 
      details: error.message 
    });
  }
});

export default debugRouter;