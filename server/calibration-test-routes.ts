import { Express, Request, Response } from 'express';
import calibrationTestRouter from './testapi/calibration-test-routes';

/**
 * Registers the calibration test routes for debugging
 */
export function registerCalibrationTestRoutes(app: Express) {
  console.log("Registering calibration test routes at /api/calibration-test");
  app.use('/api/calibration-test', calibrationTestRouter);
}