import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Upload, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface PMAFileInfoProps {
  pmaId: string | null;
  showEmptyState?: boolean;
}

interface PMADocument {
  id: number;
  fileName: string;
  filePath: string;
  fileUrl: string;
  uploadDate: string;
  uploadedBy: string;
  lastModified: string;
  documentType: string;
  description: string;
  fileSize: number | null;
}

const PMAFileInfo: React.FC<PMAFileInfoProps> = ({ pmaId, showEmptyState = false }) => {
  // Query to fetch PMA documents
  const { data: documents, isLoading, error } = useQuery<PMADocument[]>({
    queryKey: ['/api/quality/pma', pmaId, 'documents'],
    enabled: !!pmaId,
    queryFn: async () => {
      const response = await fetch(`/api/quality/pma/${pmaId}/documents`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch PMA documents');
      }
      return response.json();
    }
  });

  const handleDownload = async (documentId: number, fileName: string) => {
    try {
      console.log('Attempting to download:', { documentId, fileName });
      
      const response = await fetch(`/api/quality/pma/${documentId}/download`, {
        method: 'GET',
        credentials: 'include'
      });
      
      console.log('Download response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download failed with response:', errorText);
        throw new Error(`Download failed: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Download result:', result);
      
      if (!result.downloadUrl) {
        throw new Error('No download URL provided');
      }
      
      // Navigate directly to the signed URL to trigger download
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Downloading ${fileName}`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Error",
        description: error instanceof Error ? error.message : "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateFilename = (filename: string, maxLength: number = 30) => {
    if (filename.length <= maxLength) {
      return filename;
    }
    const extension = filename.split('.').pop();
    const nameWithoutExtension = filename.substring(0, filename.lastIndexOf('.'));
    const truncatedName = nameWithoutExtension.substring(0, maxLength - extension!.length - 4);
    return `${truncatedName}...${extension}`;
  };

  if (!pmaId && showEmptyState) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="text-center text-gray-500">
          <FileText className="mx-auto h-8 w-8 mb-2 text-gray-400" />
          <p className="text-sm">No PMA document created yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Files will appear here after the PMA document is created.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto mb-2"></div>
          <p className="text-sm">Loading file information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <div className="text-center text-red-600">
          <FileText className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">Error loading file information</p>
          <p className="text-xs mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="text-center text-gray-500">
          <FileText className="mx-auto h-8 w-8 mb-2 text-gray-400" />
          <p className="text-sm">No files uploaded yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Upload a file using the file input above.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Files ({documents.length})
        </span>
        <Badge variant="secondary" className="text-xs">
          {documents.length} file{documents.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      
      {documents.map((doc, index) => (
        <div key={`${doc.id}-${index}`} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-start justify-between space-x-3">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <div className="flex-shrink-0">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate" title={doc.fileName}>
                    {truncateFilename(doc.fileName)}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    {doc.documentType}
                  </Badge>
                </div>
                
                <p className="text-xs text-gray-600 mb-2" title={doc.description}>
                  {doc.description}
                </p>
                
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>Uploaded: {formatDate(doc.uploadDate)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <User className="h-3 w-3" />
                    <span>By: {doc.uploadedBy || 'Unknown'}</span>
                  </div>
                </div>
                
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 border">
                  <span className="text-gray-500">GCS Path:</span> {doc.filePath}
                </div>
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(doc.id, doc.fileName)}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PMAFileInfo;