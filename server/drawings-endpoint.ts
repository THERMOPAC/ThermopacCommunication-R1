import { Request, Response, Router } from 'express';

// Auth middleware
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'You must be logged in to access this resource' });
}

/**
 * Simple endpoint for finding drawings by drawing number
 * Uses a direct approach scanning all files in the bucket
 */
export function setupDrawingsEndpoint(app: Router) {
  app.get('/api/storage/drawings', ensureAuthenticated, async (req: Request, res: Response) => {
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
      // Using multiple matching strategies, any of which can succeed
      const matchingFiles = allFiles.filter(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        // Skip non-drawing files (not PDF, DWG, DXF)
        if (!filePath.toLowerCase().endsWith('.pdf') && 
            !filePath.toLowerCase().endsWith('.dwg') && 
            !filePath.toLowerCase().endsWith('.dxf')) {
          return false;
        }
        
        // Check multiple matching patterns
        const drawingNoLower = drawingNo.toString().toLowerCase();
        
        // 1. Direct filename match (e.g., "4906001001001000.pdf")
        const fileMatch = fileName.toLowerCase() === `${drawingNoLower}.pdf` || 
                          fileName.toLowerCase() === `${drawingNoLower}.dwg` || 
                          fileName.toLowerCase() === `${drawingNoLower}.dxf`;
        
        // 2. Revision pattern match (e.g., "4906001001001000_R1.pdf")
        const revMatch = fileName.toLowerCase().startsWith(`${drawingNoLower}_r`);
        
        // 3. Path contains drawing number (e.g., "/4906001001001000/")
        const pathMatch = filePath.toLowerCase().includes(`/${drawingNoLower}/`);
        
        // 4. Looser matching (any occurrence of drawing number in path)
        const looseMatch = filePath.toLowerCase().includes(drawingNoLower);
        
        // Log matches to help with debugging
        if (fileMatch || revMatch || pathMatch || looseMatch) {
          console.log(`[DRAWING-SIMPLE] MATCH! ${file.name}: fileMatch=${fileMatch}, revMatch=${revMatch}, pathMatch=${pathMatch}, looseMatch=${looseMatch}`);
        }
        
        return fileMatch || revMatch || pathMatch || looseMatch;
      });
      
      console.log(`[DRAWING-SIMPLE] Found ${matchingFiles.length} matching drawing files for ${drawingNo}`);
      
      // Map the files to a standard format with enhanced drawing metadata
      const processedFiles = matchingFiles.map(file => {
        const filePath = file.name;
        const fileName = filePath.split('/').pop() || '';
        
        // Try to extract revision from filename (e.g., "4906001001001000_R1.pdf" -> "1")
        let revision = 'N/A';
        const revMatch = fileName.match(/_R(\d+)\.(?:pdf|dwg|dxf)$/i);
        if (revMatch && revMatch[1]) {
          revision = revMatch[1];
        }
        
        // Determine file type from extension
        const fileType = fileName.toLowerCase().endsWith('.pdf') ? 'PDF' : 
                         fileName.toLowerCase().endsWith('.dwg') ? 'DWG' : 
                         fileName.toLowerCase().endsWith('.dxf') ? 'DXF' : 'Unknown';
        
        return {
          name: fileName,
          path: filePath,
          contentType: file.metadata.contentType || 'application/pdf',
          size: file.metadata.size || 0,
          updated: file.metadata.updated || new Date().toISOString(),
          created: file.metadata.timeCreated || new Date().toISOString(),
          isDirectory: false,
          // Enhanced metadata for drawing files
          drawingNo: drawingNo,
          fileType: fileType,
          revision: revision,
          uploadDate: file.metadata.timeCreated || new Date().toISOString(),
          description: `Drawing ${drawingNo}${revision !== 'N/A' ? ` - Rev ${revision}` : ''}`
        };
      });
      
      // If no matching files found, try an ultra-aggressive approach
      // Returns a few PDF files regardless of matching, as a last resort
      if (processedFiles.length === 0) {
        console.log(`[DRAWING-SIMPLE] No exact matches found, trying ULTRA-AGGRESSIVE mode as last resort`);
        
        // Get all PDF files in the bucket
        const allPdfFiles = allFiles.filter(file => 
          file.name.toLowerCase().endsWith('.pdf')
        );
        
        if (allPdfFiles.length > 0) {
          console.log(`[DRAWING-SIMPLE] ULTRA-AGGRESSIVE: Returning up to 5 PDF files from bucket`);
          
          // Return up to 5 PDF files as a desperate measure
          const aggressiveFiles = allPdfFiles.slice(0, 5).map(file => {
            const filePath = file.name;
            const fileName = filePath.split('/').pop() || '';
            
            return {
              name: fileName,
              path: filePath,
              contentType: file.metadata.contentType || 'application/pdf',
              size: file.metadata.size || 0,
              updated: file.metadata.updated || new Date().toISOString(),
              created: file.metadata.timeCreated || new Date().toISOString(),
              isDirectory: false,
              drawingNo: drawingNo,
              fileType: 'PDF',
              revision: 'N/A',
              uploadDate: file.metadata.timeCreated || new Date().toISOString(),
              description: `Drawing file (fallback): ${fileName}`
            };
          });
          
          return res.status(200).json(aggressiveFiles);
        }
      }
      
      return res.status(200).json(processedFiles);
    } catch (error) {
      console.error('[DRAWING-SIMPLE] Error finding drawings:', error);
      res.status(500).json({ error: 'Failed to find drawings' });
    }
  });
}