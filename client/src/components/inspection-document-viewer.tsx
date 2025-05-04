import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Download, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatFileSize as formatBytes, formatDate } from '@/lib/utils';

interface InspectionDocumentViewerProps {
  inspectionOrderNumber: string;
  tabName: string;
  recordId: string;
  className?: string;
}

interface Document {
  id: number;
  inspectionOrderId: number;
  tabName: string;
  recordId: string;
  fileName: string;
  filePath: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  uploadedBy?: number;
  createdAt: string;
  updatedAt: string;
}

const InspectionDocumentViewer: React.FC<InspectionDocumentViewerProps> = ({
  inspectionOrderNumber,
  tabName,
  recordId,
  className = '',
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/quality/inspection-documents', inspectionOrderNumber, tabName, recordId],
    queryFn: async () => {
      const response = await fetch(`/api/quality/inspection-documents/${inspectionOrderNumber}/${tabName}/${recordId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch documents');
      }
      
      return response.json() as Promise<Document[]>;
    },
    // Only try to fetch if we have the required parameters
    enabled: !!inspectionOrderNumber && !!tabName && !!recordId,
  });
  
  const openDocument = (url?: string) => {
    if (!url) return;
    
    // Open document in a new tab
    window.open(url, '_blank');
  };
  
  const downloadDocument = (document: Document) => {
    if (!document.fileUrl) return;
    
    // Create a temporary anchor element
    const a = window.document.createElement('a');
    a.href = document.fileUrl;
    a.download = document.fileName || `document_${document.id}.pdf`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading documents...
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-sm text-destructive p-2">
        Error: {error instanceof Error ? error.message : 'Failed to load documents'}
      </div>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-2">
        No documents uploaded yet.
      </div>
    );
  }
  
  return (
    <div className={className}>
      {data.map((document) => (
        <Card key={document.id} className="mb-3">
          <CardHeader className="py-2">
            <CardTitle className="text-base flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              {document.fileName}
            </CardTitle>
            <CardDescription className="text-xs">
              Uploaded on {formatDate(document.createdAt)}
              {document.fileSize ? ` • ${formatBytes(document.fileSize)}` : ''}
            </CardDescription>
          </CardHeader>
          <CardFooter className="pt-0 pb-2 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDocument(document.fileUrl)}
              disabled={!document.fileUrl}
            >
              <Eye className="h-4 w-4 mr-1" /> View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadDocument(document)}
              disabled={!document.fileUrl}
            >
              <Download className="h-4 w-4 mr-1" /> Download
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default InspectionDocumentViewer;