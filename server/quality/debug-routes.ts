import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../middleware/auth-middleware';
import { inspectionOrderDebugAPIRoute } from './inspection-order-debug';

const debugRouter = Router();

/**
 * Debug inspection order generation for a project
 */
debugRouter.get('/inspection-orders/debug/:projectId', ensureAuthenticated, inspectionOrderDebugAPIRoute);

export default debugRouter;