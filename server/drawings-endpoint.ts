import { Request, Response, Router } from 'express';

/**
 * Simple endpoint for finding drawings by drawing number
 * Uses a direct approach scanning all files in the bucket
 */
export function setupDrawingsEndpoint(app: Router) {
  app.get('/api/storage/drawings', async (req: Request, res: Response) => {
    try {
      const drawingNo = req.query.drawingNo as string;
      
      if (!drawingNo) {
        return res.status(400).json({ error: 'Drawing number is required' });
      }
      
      console.log(`[DRAWING-SIMPLE] Looking for drawings with number: ${drawingNo}`);
            
      // Import storage module directly 
      const storageModule = await import('./utils/storage-config');
      const bucketName = storageModule.bucketName;
      const storage = storageModule.default;
      const bucket = storage.bucket(bucketName);
      
      // Get all files in the bucket
      console.log(`[DRAWING-SIMPLE] Getting all files from bucket: ${bucketName}`);
      const [allFiles] = await bucket.getFiles();
      
      console.log(`[DRAWING-SIMPLE] Found ${allFiles.length} total files in bucket`);
      
      // Filter to only include relevant drawing files
      const matchingFiles = allFiles.filter(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        // Skip non-drawing files (not PDF, DWG, DXF)
        if (!filePath.toLowerCase().endsWith('.pdf') && 
            !filePath.toLowerCase().endsWith('.dwg') && 
            !filePath.toLowerCase().endsWith('.dxf')) {
          return false;
        }
        
        // Check if the drawing number appears anywhere in the path
        const filePathLower = filePath.toLowerCase();
        const drawingNoLower = drawingNo.toLowerCase();
        
        return filePathLower.includes(drawingNoLower);
      });
      
      console.log(`[DRAWING-SIMPLE] Found ${matchingFiles.length} matching drawing files for ${drawingNo}`);
      
      // Map the files to a standard format
      const processedFiles = matchingFiles.map(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        return {
          name: fileName,
          path: filePath,
          contentType: file.metadata.contentType || 'application/pdf',
          size: file.metadata.size || 0,
          updated: file.metadata.updated || new Date().toISOString(),
          created: file.metadata.timeCreated || new Date().toISOString(),
          isDirectory: false
        };
      });
      
      return res.status(200).json(processedFiles);
    } catch (error) {
      console.error('[DRAWING-SIMPLE] Error finding drawings:', error);
      res.status(500).json({ error: 'Failed to find drawings' });
    }
  });
}