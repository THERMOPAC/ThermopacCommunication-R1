import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Upload, Calendar, User, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: number;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  file_size: number;
  document_type: string;
  description: string;
  uploaded_by: number;
  created_at: string;
}

interface MaterialFileInfoSectionProps {
  materialId: number | null;
  showTitle?: boolean;
  className?: string;
}

export function MaterialFileInfoSection({ 
  materialId, 
  showTitle = true, 
  className = "" 
}: MaterialFileInfoSectionProps) {
  const { toast } = useToast();

  // Fetch documents for this material identification record
  const { data: documents, isLoading, error } = useQuery({
    queryKey: [`/api/quality/material-identification/${materialId}/documents`],
    enabled: !!materialId,
  });

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  // Handle file download
  const handleDownload = async (document: Document) => {
    try {
      const response = await fetch(`/api/quality/material-identification/${materialId}/documents/${document.id}/download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.file_name || 'document';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download successful",
        description: `Downloaded ${document.file_name}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download document",
        variant: "destructive",
      });
    }
  };

  // Don't render if materialId is null or documents are loading
  if (!materialId) {
    return (
      <Card className={`border-gray-200 ${className}`}>
        <CardHeader className="pb-3">
          {showTitle && (
            <CardTitle className="text-base font-medium text-gray-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Files
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Save the record first to view uploaded files</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={`border-gray-200 ${className}`}>
        <CardHeader className="pb-3">
          {showTitle && (
            <CardTitle className="text-base font-medium text-gray-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Files
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading files...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`border-gray-200 ${className}`}>
        <CardHeader className="pb-3">
          {showTitle && (
            <CardTitle className="text-base font-medium text-gray-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Uploaded Files
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-red-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Error loading files</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-gray-200 ${className}`}>
      <CardHeader className="pb-3">
        {showTitle && (
          <CardTitle className="text-base font-medium text-gray-700 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Uploaded Files
            {documents && documents.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {documents.length}
              </Badge>
            )}
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        {!documents || documents.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No files uploaded yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Upload files from the list page using the Upload button
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((document: Document) => (
              <div
                key={document.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {document.file_name}
                    </p>
                    <div className="flex items-center space-x-4 mt-1">
                      <div className="flex items-center text-xs text-gray-500">
                        <HardDrive className="h-3 w-3 mr-1" />
                        {formatFileSize(document.file_size)}
                      </div>
                      <div className="flex items-center text-xs text-gray-500">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(document.created_at)}
                      </div>
                    </div>
                    {document.file_path && (
                      <p className="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-1 rounded text-wrap break-all">
                        <span className="text-gray-400">Path:</span> {document.file_path}
                      </p>
                    )}
                    {document.description && (
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {document.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {document.document_type.replace(/_/g, ' ')}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(document)}
                    className="h-8 w-8 p-0"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}