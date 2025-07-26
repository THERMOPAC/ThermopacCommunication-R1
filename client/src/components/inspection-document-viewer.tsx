import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Download, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
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
  
  const downloadMutation = useMutation({
    mutationFn: async (documentId: number | string) => {
      // Handle Final Dossier documents with virtual GCS IDs
      if (tabName === 'Final Dossier' && String(documentId).startsWith('gcs-')) {
        const document = data?.find(d => d.id === documentId);
        if (document?.filePath) {
          // For Final Dossier documents, use the file path directly with final-dossier route
          const response = await fetch(`/api/quality/final-dossier/download?filePath=${encodeURIComponent(document.filePath)}`);
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to download Final Dossier document');
          }
          
          return response;
        } else {
          throw new Error('Final Dossier document path not found');
        }
      } else {
        // Standard database document download
        const response = await fetch(`/api/quality/inspection-documents/${inspectionOrderNumber}/${tabName}/${recordId}/documents/${documentId}/download`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to download document');
        }
        
        return response;
      }
    },
    onSuccess: async (response, documentId) => {
      // Get the document to retrieve filename
      const document = data?.find(d => d.id === documentId);
      const fileName = document?.fileName || `document_${documentId}.pdf`;
      
      // Create blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Document downloaded",
        description: `${fileName} has been downloaded successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download document",
        variant: "destructive",
      });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (documentId: number | string) => {
      // Handle Final Dossier documents with virtual GCS IDs
      if (tabName === 'Final Dossier' && String(documentId).startsWith('gcs-')) {
        const document = data?.find(d => d.id === documentId);
        if (document?.filePath) {
          // For Final Dossier documents, use the file path directly with final-dossier route
          const response = await fetch(`/api/quality/final-dossier/delete?filePath=${encodeURIComponent(document.filePath)}`, {
            method: 'DELETE',
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete Final Dossier document');
          }
          
          return response.json();
        } else {
          throw new Error('Final Dossier document path not found');
        }
      } else {
        // Standard database document deletion
        const response = await fetch(`/api/quality/inspection-documents/${inspectionOrderNumber}/${tabName}/${recordId}/documents/${documentId}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete document');
        }
        
        return response.json();
      }
    },
    onSuccess: (responseData, documentId) => {
      // Get the document to retrieve filename before it's removed from the cache
      const document = data?.find(d => d.id === documentId);
      const fileName = document?.fileName || `Document ${documentId}`;
      
      // Invalidate and refetch the documents
      queryClient.invalidateQueries({
        queryKey: ['/api/quality/inspection-documents', inspectionOrderNumber, tabName, recordId]
      });
      
      toast({
        title: "Document deleted",
        description: `${fileName} has been deleted successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    },
  });
  
  const openDocument = (url?: string) => {
    if (!url) return;
    
    // Open document in a new tab
    window.open(url, '_blank');
  };
  
  const downloadDocument = (document: Document) => {
    downloadMutation.mutate(document.id);
  };
  
  const deleteDocument = (document: Document) => {
    if (window.confirm(`Are you sure you want to delete "${document.fileName}"? This action cannot be undone.`)) {
      deleteMutation.mutate(document.id);
    }
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
              Uploaded on {formatDate(new Date(document.createdAt))}
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
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Download
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteDocument(document)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Delete
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};

export default InspectionDocumentViewer;