import express, { Express } from 'express';
import templateRoutes from './template-routes';

/**
 * Register template management routes with the Express application
 * @param app Express application
 */
export function registerTemplateManagementRoutes(app: Express) {
  // Mount the template routes at the appropriate path
  app.use('/api/templates', templateRoutes);
  console.log('Template management routes registered');
}