import express, { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

export function setupApiTestRoutes(app: Express) {
  // Special route for serving our HTML API test page
  app.get('/api-test-page', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    
    // Path to our test HTML file
    const filePath = path.join(process.cwd(), 'client/src/pages/direct-test.html');
    
    try {
      if (fs.existsSync(filePath)) {
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        return res.send(htmlContent);
      } else {
        return res.status(404).send('Test page not found');
      }
    } catch (error) {
      console.error('Error serving API test page:', error);
      return res.status(500).send('Error serving test page');
    }
  });
  
  console.log('API Test routes registered');
}