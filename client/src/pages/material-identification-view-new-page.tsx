import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FileUp, Edit, Download, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

// Define interface for the Material Identification record
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_name: string;
  project_number: string;
  inspection_order_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  heat_number: string;
  batch_number: string | null;
  mill_name: string;
  mill_test_certificate_number: string;
  quantity: string;
  dimensions: string;
  material_status: string;
  inspector_name: string;
  inspection_date: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

// Define interface for document
interface Document {
  id: number;
  material_identification_id: number;
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

interface MaterialIdentificationViewProps {
  params: {
    id: string;
  };
}

export default function MaterialIdentificationViewNewPage({ params }: MaterialIdentificationViewProps) {
  const [, navigate] = useLocation();
  const recordId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('general');
  const [documentDescription, setDocumentDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  
  // Fetch the Material Identification record
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/quality/material-identification/${recordId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch material identification record');
      }
      return response.json();
    },
    enabled: !!recordId && recordId !== 'new',
  });
  
  // Fetch documents for this material identification
  const { data: documents, isLoading: isLoadingDocuments } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId, 'documents'],
    queryFn: async () => {
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!recordId && recordId !== 'new',
  });

  // Format date from API (YYYY-MM-DD) to readable format
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return format(date, 'PPP'); // Format as "Apr 29, 2023"
    } catch (error) {
      return dateString;
    }
  };
  
  // Get color for material status badge
  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'hold':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Navigate to edit page for this record
  const handleEdit = () => {
    navigate(`/quality/material-identification/edit/${recordId}`);
  };
  
  // Handle file input change
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    }
  };
  
  // Reset upload form
  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocumentType('general');
    setDocumentDescription('');
    setUploadDialogOpen(false);
    setIsUploading(false);
  };
  
  // Upload document
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', documentType);
      formData.append('description', documentDescription);
      
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload document');
      }
      
      // Invalidate document cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/quality/material-identification', recordId, 'documents'] });
      
      toast({
        title: "Document uploaded",
        description: "Document has been successfully uploaded",
      });
      
      resetUploadForm();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Delete document
  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;
    
    try {
      const response = await fetch(`/api/quality/material-identification/documents/${documentToDelete.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
      
      // Invalidate document cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/quality/material-identification', recordId, 'documents'] });
      
      toast({
        title: "Document deleted",
        description: "Document has been successfully deleted",
      });
      
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete document. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <div className="flex justify-center items-center h-40">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>
                Failed to load the Material Identification record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>There was an error loading this record. Please try again or contact support.</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => navigate('/quality/material-identification')}
              >
                Back to List
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const record: MaterialIdentification = data;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Material Identification Record
                <Badge className={getStatusColor(record.material_status)}>
                  {record.material_status}
                </Badge>
              </CardTitle>
              <CardDescription>
                Viewing material identification record {record.material_identification_id}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => navigate('/quality/material-identification')}>
                Back to List
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-6">
              {/* Header Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">MI ID</h3>
                  <p className="text-lg font-semibold">{record.material_identification_id}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Project</h3>
                  <p className="text-lg font-semibold">{record.project_number}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Project Name</h3>
                  <p className="text-lg font-semibold">{record.project_name}</p>
                </div>
              </div>

              {/* Material Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Description</h3>
                  <p className="mt-1">{record.material_description}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Code</h3>
                  <p className="mt-1">{record.material_code}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Specification</h3>
                  <p className="mt-1">{record.specification}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Grade</h3>
                  <p className="mt-1">{record.material_grade}</p>
                </div>
              </div>

              {/* Heat/Batch/Mill Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Heat Number</h3>
                  <p className="mt-1">{record.heat_number}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Batch Number</h3>
                  <p className="mt-1">{record.batch_number || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Mill Name</h3>
                  <p className="mt-1">{record.mill_name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Mill Test Certificate No.</h3>
                  <p className="mt-1">{record.mill_test_certificate_number}</p>
                </div>
              </div>

              {/* Quantity/Dimensions Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Quantity</h3>
                  <p className="mt-1">{record.quantity}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Dimensions</h3>
                  <p className="mt-1">{record.dimensions}</p>
                </div>
              </div>

              {/* Inspection Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Inspector's Name</h3>
                  <p className="mt-1">{record.inspector_name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Inspection Date</h3>
                  <p className="mt-1">{formatDate(record.inspection_date)}</p>
                </div>
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Remarks</h3>
                  <p className="mt-1">{record.remarks || 'No remarks provided'}</p>
                </div>
              </div>

              {/* Document Section with GCS integration */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-medium text-gray-500">Documents</h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setUploadDialogOpen(true)}
                  >
                    <FileUp className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </div>
                
                {isLoadingDocuments ? (
                  <div className="flex justify-center items-center h-20">
                    <span className="loading loading-spinner text-primary"></span>
                  </div>
                ) : documents && documents.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-xs font-medium text-gray-500 text-left">Filename</th>
                          <th className="px-4 py-2 text-xs font-medium text-gray-500 text-left">Type</th>
                          <th className="px-4 py-2 text-xs font-medium text-gray-500 text-left">Date</th>
                          <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {documents.map((doc: Document) => {
                          // Extract the actual filename from the file_path
                          // Format: QMS/Material_Identification/{MI ID}/{Document Type}.{extension}
                          const pathParts = doc.file_path.split('/');
                          const fileName = pathParts[pathParts.length - 1]; // Last part contains the filename
                          
                          return (
                            <tr key={doc.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">{fileName}</td>
                              <td className="px-4 py-3 text-sm">{doc.document_type}</td>
                              <td className="px-4 py-3 text-sm">{formatDate(doc.created_at)}</td>
                              <td className="px-4 py-3 text-sm text-right">
                                <div className="flex justify-end gap-2">
                                  <a 
                                    href={doc.file_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 hover:bg-gray-100"
                                    title="Download"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                  <button
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 hover:bg-red-100 hover:text-red-500"
                                    title="Delete"
                                    onClick={() => {
                                      setDocumentToDelete(doc);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-md text-center">
                    <FileText className="h-10 w-10 mx-auto text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No documents have been uploaded yet.</p>
                  </div>
                )}
              </div>

              {/* Metadata and Timestamps */}
              <div className="mt-6 text-xs text-gray-500">
                <p>Created: {formatDate(record.created_at)}</p>
                <p>Last Updated: {formatDate(record.updated_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Document Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a document for Material Identification record {record.material_identification_id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="file">File</Label>
              <Input 
                id="file" 
                type="file" 
                onChange={handleFileChange} 
                disabled={isUploading}
              />
              {selectedFile && (
                <p className="text-xs text-gray-500">
                  Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              )}
            </div>
            
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="documentType">Document Type</Label>
              <select 
                id="documentType"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                disabled={isUploading}
              >
                <option value="general">General Document</option>
                <option value="mill_test_certificate">Mill Test Certificate</option>
                <option value="inspection_report">Inspection Report</option>
                <option value="material_certificate">Material Certificate</option>
                <option value="test_report">Test Report</option>
                <option value="technical_datasheet">Technical Datasheet</option>
                <option value="other">Other Document</option>
              </select>
            </div>
            
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input 
                id="description" 
                placeholder="Brief description of the document"
                value={documentDescription}
                onChange={(e) => setDocumentDescription(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </div>
          <DialogFooter className="flex space-x-2 justify-end">
            <Button 
              variant="outline" 
              onClick={resetUploadForm}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Document Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {documentToDelete && (
              <div className="flex items-center p-4 border rounded-md bg-gray-50">
                <FileText className="h-8 w-8 mr-3 text-blue-500" />
                <div>
                  <p className="font-medium">
                    {documentToDelete.file_path.split('/').pop()}
                  </p>
                  <p className="text-xs text-gray-500">
                    Type: {documentToDelete.document_type}, 
                    Uploaded: {formatDate(documentToDelete.created_at)}
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex space-x-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteDialogOpen(false);
                setDocumentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteDocument}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}