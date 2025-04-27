import express, { Express } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';

const router = express.Router();

// Register WPS/PQR management routes
router.use('/wps-pqr', wpsPqrRoutes);

// Add more quality management routes here as needed
// Example: router.use('/welder-management', welderRoutes);

/**
 * Set up quality management routes
 * @param app Express application
 */
export function setupQualityRoutes(app: Express) {
  app.use('/api/quality', router);
  console.log('Quality management routes registered');
}

export default router;