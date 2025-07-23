import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DrawingFilesDisplayProps {
  inspectionOrderNumber: string;
  recordId: string;
  recordTitle: string;
}

interface UploadedDocument {
  id: number;
  fileName: string;
  filePath: string;
  fileUrl?: string;
  fileType: string;
  fileSize: number;
  uploadedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

const DrawingFilesDisplay: React.FC<DrawingFilesDisplayProps> = ({
  inspectionOrderNumber,
  recordId,
  recordTitle
}) => {
  // Fetch uploaded documents for this specific record
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['/api/quality/inspection-documents', inspectionOrderNumber, 'Approved Drawing', recordId],
    queryFn: async (): Promise<UploadedDocument[]> => {
      const response = await fetch(`/api/quality/inspection-documents/${inspectionOrderNumber}/Approved%20Drawing/${recordId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!inspectionOrderNumber && !!recordId
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = async (documentId: number) => {
    try {
      const downloadUrl = `/api/quality/inspection-documents/${inspectionOrderNumber}/Approved%20Drawing/${recordId}/documents/${documentId}/download`;
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  if (isLoading) {
    return (
      <Card className="mb-2">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="h-4 w-4" />
            <span>Loading files for {recordTitle}...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-2 border-red-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm text-red-600">
            <FileText className="h-4 w-4" />
            <span>Error loading files for {recordTitle}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <Card className="mb-2 border-gray-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="h-4 w-4" />
            <span>{recordTitle}: No files uploaded</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-2 border-blue-200">
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <FileText className="h-4 w-4 text-blue-600" />
            <span>{recordTitle}</span>
            <Badge variant="secondary" className="text-xs">
              {documents.length} file{documents.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          
          <div className="space-y-1">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.fileName}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {doc.fileType.split('/')[1]?.toUpperCase() || 'FILE'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>Size: {formatFileSize(doc.fileSize)}</span>
                    <span>Uploaded: {formatDate(doc.createdAt)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 font-mono truncate">
                    Path: {doc.filePath}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100"
                    onClick={() => handleDownload(doc.id)}
                    title="Download file"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                  {doc.fileUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs bg-green-50 text-green-600 hover:bg-green-100"
                      onClick={() => window.open(doc.fileUrl, '_blank')}
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DrawingFilesDisplay;