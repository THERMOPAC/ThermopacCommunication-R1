import { useState, useEffect, useRef } from "react";
import { fmtDateTime } from "@/lib/date-format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Upload, Calendar, User, HardDrive, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState<string>('');
  
  // Replacement state
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacingDocumentId, setReplacingDocumentId] = useState<number | null>(null);

  // Fetch documents for this material identification record
  const { data: documents, isLoading, error, refetch } = useQuery({
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
      return fmtDateTime(dateString);
    } catch {
      return 'Invalid date';
    }
  };

  // Handle file download
  const handleDownload = async (documentRecord: Document) => {
    try {
      const response = await fetch(`/api/quality/material-identification/${materialId}/documents/${documentRecord.id}/download`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentRecord.file_name || 'document';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download successful",
        description: `Downloaded ${documentRecord.file_name}`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download document",
        variant: "destructive",
      });
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile || !materialId) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', 'inspection_report');
      formData.append('description', description);

      const response = await fetch(`/api/quality/material-identification/${materialId}/documents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const responseData = await response.json();
      console.log('Upload response:', responseData);

      toast({
        title: "Upload successful",
        description: `Uploaded ${selectedFile.name}`,
      });

      // Reset form
      setSelectedFile(null);
      setDescription('');
      setShowUploadForm(false);
      
      // Refresh documents with delay to allow backend processing
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({
          queryKey: [`/api/quality/material-identification/${materialId}/documents`]
        });
      }, 1000);

    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file replacement
  const handleFileReplacement = async () => {
    if (!selectedFile || !materialId || !replacingDocumentId) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', 'inspection_report');
      formData.append('description', description || 'Replacement file');

      // First delete the old file, then upload the new one
      const deleteResponse = await fetch(`/api/quality/material-identification/${materialId}/documents/${replacingDocumentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!deleteResponse.ok) {
        console.warn('Failed to delete old file, proceeding with upload anyway');
      }

      // Upload the new file
      const uploadResponse = await fetch(`/api/quality/material-identification/${materialId}/documents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Replacement upload failed: ${errorText}`);
      }

      const responseData = await uploadResponse.json();
      console.log('Replacement upload response:', responseData);

      toast({
        title: "File replaced successfully",
        description: `Replaced with ${selectedFile.name}`,
      });

      // Reset replacement state
      setSelectedFile(null);
      setDescription('');
      setIsReplacing(false);
      setReplacingDocumentId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh documents with delay to allow backend processing
      setTimeout(() => {
        refetch();
        queryClient.invalidateQueries({
          queryKey: [`/api/quality/material-identification/${materialId}/documents`]
        });
      }, 1000);

    } catch (error) {
      toast({
        title: "Replacement failed",
        description: error instanceof Error ? error.message : "Failed to replace file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Start replacement mode
  const startReplacement = (documentId: number) => {
    setIsReplacing(true);
    setReplacingDocumentId(documentId);
    setShowUploadForm(false);
    setSelectedFile(null);
    setDescription('');
  };

  // Cancel replacement mode
  const cancelReplacement = () => {
    setIsReplacing(false);
    setReplacingDocumentId(null);
    setSelectedFile(null);
    setDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF, DOC, or DOCX file",
          variant: "destructive",
        });
        return;
      }
      
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  // Trigger file input
  const triggerFileInput = () => {
    fileInputRef.current?.click();
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
          <div className="space-y-4">
            {!showUploadForm ? (
              <div className="text-center py-6 text-gray-500">
                <Upload className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm mb-3">No files uploaded yet</p>
                <Button 
                  onClick={() => setShowUploadForm(true)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </div>
            ) : (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="fileInput" className="text-sm font-medium">
                      Select File
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={triggerFileInput}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {selectedFile ? selectedFile.name : 'Choose File'}
                      </Button>
                      {selectedFile && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supported: PDF, DOC, DOCX (max 10MB)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-sm font-medium">
                      Description (Optional)
                    </Label>
                    <Input
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter file description"
                      className="w-full"
                    />
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <Button
                      onClick={handleFileUpload}
                      disabled={!selectedFile || isUploading}
                      className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                    >
                      {isUploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload File
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowUploadForm(false);
                        setSelectedFile(null);
                        setDescription('');
                      }}
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                    onClick={() => startReplacement(document.id)}
                    className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    title="Replace File"
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(document)}
                    className="h-8 w-8 p-0"
                    title="Download File"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            
            {/* File Replacement Form */}
            {isReplacing && (
              <div className="mt-4 p-4 bg-orange-50 rounded-lg border-2 border-dashed border-orange-200">
                <h4 className="text-sm font-medium text-orange-800 mb-3">Replace Inspection Report</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="replacementFileInput" className="text-sm font-medium">
                      Select New File
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={triggerFileInput}
                        className="flex-1"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {selectedFile ? selectedFile.name : 'Choose File'}
                      </Button>
                      {selectedFile && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supported: PDF, DOC, DOCX (max 10MB)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="replacementDescription" className="text-sm font-medium">
                      Description (Optional)
                    </Label>
                    <Input
                      id="replacementDescription"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter replacement file description"
                      className="w-full"
                    />
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <Button
                      onClick={handleFileReplacement}
                      disabled={!selectedFile || isUploading}
                      className="bg-orange-600 hover:bg-orange-700 text-white flex-1"
                    >
                      {isUploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Replacing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Replace File
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelReplacement}
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}