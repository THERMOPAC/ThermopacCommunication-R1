import express, { Express } from 'express';
import wpsPqrRoutes from './quality/wps-pqr-routes';
import materialIdentificationRoutes from './quality/material-identification-routes';

const router = express.Router();

// Register WPS/PQR management routes
router.use('/wps-pqr', wpsPqrRoutes);

// Register Material Identification routes
router.use('/material-identification', materialIdentificationRoutes);

/**
 * Set up quality management routes
 * @param app Express application
 */
export function setupQualityRoutes(app: Express) {
  app.use('/api/quality', router);
  console.log('Quality management routes registered');
}

export default router;