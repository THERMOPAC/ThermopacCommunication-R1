import React, { useState, useEffect } from 'react';
import { FolderIcon, FileIcon, DownloadIcon, TrashIcon, FolderPlusIcon, UploadIcon } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { formatFileSize } from '@/lib/utils';
import { toast } from "@/hooks/use-toast";

interface FileStorageProps {
  projectId: number;
  projectCode: string;
  financialYear: string;
}

interface FileItem {
  name: string;
  path: string;
  size: number;
  contentType: string;
  updated: string;
  created: string;
}

interface DirectoryItem {
  id: number;
  financialYear: string;
  projectCode: string;
  department: string;
  subDirectory?: string;
  fullPath: string;
  createdBy: number;
  createdAt: string;
  isPublic: boolean;
  isTemplate?: boolean;
}

interface UploadUrlRequest {
  financialYear: string;
  projectCode: string;
  department: string;
  subDirectory?: string;
  fileName: string;
  contentType: string;
}

interface UploadUrlResponse {
  signedUrl: string;
  storagePath: string;
  expiresAt: string;
}

interface DirectoryTemplate {
  id: number;
  department: string;
  subDirectory: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

const departments = [
  { id: 'design', name: 'Design' },
  { id: 'procurement', name: 'Procurement' },
  { id: 'manufacturing', name: 'Manufacturing' },
  { id: 'quality', name: 'Quality' },
  { id: 'sales', name: 'Sales' },
  { id: 'finance', name: 'Finance' },
];

export default function FileStorage({ projectId, projectCode, financialYear }: FileStorageProps) {
  // Prevent any events in this component from propagating to parent elements
  const stopEventPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentDepartment, setCurrentDepartment] = useState<string>('');
  const [currentSubDirectory, setCurrentSubDirectory] = useState<string>('');
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [newDirectoryName, setNewDirectoryName] = useState<string>('');
  const [isCreateDirectoryOpen, setIsCreateDirectoryOpen] = useState<boolean>(false);
  const [isUploadFileOpen, setIsUploadFileOpen] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Get directory structure for this project
  const { data: directories, isLoading: directoriesLoading } = useQuery({
    queryKey: ['/api/storage/directories', financialYear, projectCode],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/storage/directories/${financialYear}/${projectCode}`);
        console.log("Directory API response:", response);
        const data = await response.json();
        console.log("Directory data:", data);
        return data as DirectoryItem[];
      } catch (error) {
        console.error("Error fetching directories:", error);
        throw new Error('Failed to fetch directory structure');
      }
    },
  });

  // Get available directory templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/storage/templates'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/storage/templates');
        const data = await response.json();
        console.log("Templates data:", data);
        return data as Record<string, DirectoryTemplate[]>;
      } catch (error) {
        console.error("Error fetching templates:", error);
        throw new Error('Failed to fetch directory templates');
      }
    },
  });

  // Get files in the current directory
  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = useQuery({
    queryKey: ['/api/storage/files', currentPath],
    queryFn: async () => {
      if (!currentPath) return [] as FileItem[];
      
      try {
        const response = await apiRequest('GET', `/api/storage/files?path=${encodeURIComponent(currentPath)}`);
        console.log("Files API response:", response);
        const data = await response.json();
        console.log("Files data:", data);
        return data as FileItem[];
      } catch (error) {
        console.error("Error fetching files:", error);
        throw new Error('Failed to fetch files');
      }
    },
    enabled: !!currentPath, // Only run this query if currentPath is not empty
  });

  // Create directory mutation
  const createDirectoryMutation = useMutation({
    mutationFn: async (data: { 
      financialYear: string; 
      projectCode: string; 
      department: string; 
      subDirectory?: string;
    }) => {
      const response = await apiRequest('POST', '/api/storage/directories', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Directory created',
        description: 'Directory has been created successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/directories'] });
      setIsCreateDirectoryOpen(false);
      setNewDirectoryName('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create directory',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentDepartment) {
        throw new Error('Please select a department');
      }
      
      // Step 1: Generate a signed URL for the upload
      const uploadUrlRequest: UploadUrlRequest = {
        financialYear,
        projectCode,
        department: currentDepartment,
        subDirectory: currentSubDirectory || undefined,
        fileName: file.name,
        contentType: file.type,
      };
      
      const urlResponse = await apiRequest('POST', '/api/storage/upload-url', uploadUrlRequest);
      const urlData = await urlResponse.json() as UploadUrlResponse;
      
      // Step 2: Upload the file directly to GCS using the signed URL
      const uploadResponse = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }
      
      // Step 3: Create a document record in our database
      try {
        const formData = new FormData();
        formData.append('projectId', projectId.toString());
        formData.append('file', file);
        formData.append('financialYear', financialYear);
        formData.append('projectCode', projectCode);
        formData.append('department', currentDepartment);
        
        if (currentSubDirectory) {
          formData.append('subDirectory', currentSubDirectory);
        }
        
        // We need to use fetch directly here because apiRequest doesn't support FormData
        const response = await fetch('/api/storage/upload', {
          method: 'POST',
          credentials: 'include', // Important for auth cookies
          body: formData,
        });
        
        console.log("Upload document response:", response);
        
        if (!response.ok) {
          throw new Error('Failed to create document record');
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error creating document record:", error);
        throw new Error('Failed to create document record: ' + error.message);
      }
    },
    onSuccess: () => {
      toast({
        title: 'File uploaded',
        description: 'File has been uploaded successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files', currentPath] });
      setIsUploadFileOpen(false);
      setFileToUpload(null);
      setUploadProgress(0);
      refetchFiles();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to upload file',
        description: error.message,
        variant: 'destructive',
      });
      setUploadProgress(0);
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const response = await apiRequest('DELETE', '/api/storage/files', { filePath });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'File deleted',
        description: 'File has been deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storage/files', currentPath] });
      setSelectedFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete file',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Generate download URL mutation
  const generateDownloadUrlMutation = useMutation({
    mutationFn: async (filePath: string) => {
      try {
        const response = await apiRequest('GET', `/api/storage/download-url?filePath=${encodeURIComponent(filePath)}`);
        console.log("Download URL API response:", response);
        const data = await response.json();
        return data as { downloadUrl: string };
      } catch (error) {
        console.error("Error generating download URL:", error);
        throw new Error('Failed to generate download URL');
      }
    },
    onSuccess: (data) => {
      // Open the download URL in a new tab
      window.open(data.downloadUrl, '_blank');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to download file',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle department selection
  const handleDepartmentSelect = (department: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCurrentDepartment(department);
    setCurrentSubDirectory('');
    setCurrentPath(`${financialYear}/${projectCode}/${department}`);
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = (path: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setCurrentPath(path);
  };

  // Handle file upload
  const handleFileUpload = () => {
    if (fileToUpload) {
      uploadFileMutation.mutate(fileToUpload);
    }
  };

  // Handle create directory
  const handleCreateDirectory = () => {
    if (!newDirectoryName.trim() || !currentDepartment) {
      toast({
        title: 'Error',
        description: 'Please enter a directory name and select a department',
        variant: 'destructive',
      });
      return;
    }
    
    createDirectoryMutation.mutate({ 
      financialYear, 
      projectCode, 
      department: currentDepartment,
      subDirectory: currentSubDirectory ? `${currentSubDirectory}/${newDirectoryName}` : newDirectoryName,
    });
  };

  // Render file list
  const renderFileList = () => {
    if (filesLoading) {
      return <div className="p-4 text-center">Loading files...</div>;
    }
    
    if (!files || files.length === 0) {
      return <div className="p-4 text-center text-muted-foreground">No files found in this directory</div>;
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {files.map((file) => (
          <Card key={file.path} className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setSelectedFile(file)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <FileIcon className="h-4 w-4 mr-2" />
                {file.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </CardContent>
            <CardFooter className="pt-0">
              <div className="flex justify-between w-full">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    generateDownloadUrlMutation.mutate(file.path);
                  }}
                >
                  <DownloadIcon className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to delete ${file.name}?`)) {
                      deleteFileMutation.mutate(file.path);
                    }
                  }}
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  // Render directory structure
  const renderDirectoryStructure = () => {
    if (directoriesLoading) {
      return <div className="p-4 text-center">Loading directories...</div>;
    }
    
    if (!directories || directories.length === 0) {
      return <div className="p-4 text-center text-muted-foreground">No directories found for this project</div>;
    }
    
    console.log("Directory data in client:", directories);
    
    // Group directories by department
    const directoryByDepartment = directories.reduce<Record<string, DirectoryItem[]>>((acc, dir) => {
      if (!acc[dir.department]) {
        acc[dir.department] = [];
      }
      
      // Include all subdirectories (even if the field is empty, as we'll filter later)
      if (dir.subDirectory !== null) {
        acc[dir.department].push(dir);
      }
      
      return acc;
    }, {});
    
    return (
      <div className="space-y-4 p-4">
        {departments.map((dept) => {
          const deptDirs = directoryByDepartment[dept.id] || [];
          
          return (
            <div key={dept.id} className="space-y-2">
              <Button 
                variant={currentDepartment === dept.id ? "default" : "outline"} 
                className="w-full justify-start" 
                onClick={(e) => handleDepartmentSelect(dept.id, e)}
              >
                <FolderIcon className="h-4 w-4 mr-2" />
                {dept.name}
              </Button>
              
              {deptDirs.length > 0 && currentDepartment === dept.id && (
                <div className="pl-6 space-y-1">
                  {deptDirs.map((dir) => (
                    <Button 
                      key={dir.id} 
                      variant="ghost" 
                      className="w-full justify-start text-sm" 
                      onClick={(e) => {
                        stopEventPropagation(e);
                        setCurrentSubDirectory(dir.subDirectory || '');
                        setCurrentPath(dir.fullPath);
                      }}
                    >
                      <FolderIcon className="h-3 w-3 mr-2" />
                      {dir.subDirectory}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" onClick={stopEventPropagation}>
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold">Project Files: {projectCode}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={(e) => {
              stopEventPropagation(e);
              setIsCreateDirectoryOpen(true);
            }}
            disabled={!currentDepartment}
          >
            <FolderPlusIcon className="h-4 w-4 mr-2" />
            New Directory
          </Button>
          <Button
            variant="default"
            onClick={(e) => {
              stopEventPropagation(e);
              setIsUploadFileOpen(true);
            }}
            disabled={!currentDepartment}
          >
            <UploadIcon className="h-4 w-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>
      
      {/* Breadcrumb navigation */}
      {currentPath && (
        <div className="p-4 border-b">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={(e) => {
                  stopEventPropagation(e);
                  setCurrentPath('');
                }}>Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              
              {currentPath.split('/').map((segment, index, array) => {
                // Build the path up to this segment
                const path = array.slice(0, index + 1).join('/');
                
                return (
                  <React.Fragment key={path}>
                    <BreadcrumbItem>
                      {index === array.length - 1 ? (
                        <span>{segment}</span>
                      ) : (
                        <BreadcrumbLink onClick={(e) => {
                          stopEventPropagation(e);
                          handleBreadcrumbClick(path, e);
                        }}>
                          {segment}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < array.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        {/* Directory sidebar */}
        <div className="w-64 border-r overflow-auto">
          {renderDirectoryStructure()}
        </div>
        
        {/* File content area */}
        <div className="flex-1 overflow-auto">
          {currentPath ? (
            renderFileList()
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              Select a department from the sidebar to view and manage files
            </div>
          )}
        </div>
      </div>
      
      {/* Create directory dialog */}
      <Dialog open={isCreateDirectoryOpen} onOpenChange={(open) => {
        // Stop event propagation when opening/closing dialogs
        setIsCreateDirectoryOpen(open);
      }}>
        <DialogContent onClick={stopEventPropagation}>
          <DialogHeader>
            <DialogTitle>Create New Directory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <div className="font-medium">{currentDepartment || 'No department selected'}</div>
            </div>
            
            {currentSubDirectory && (
              <div className="space-y-2">
                <Label htmlFor="current-path">Current Path</Label>
                <div className="font-medium">{currentSubDirectory}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="directory-name">Directory Name</Label>
              <Input
                id="directory-name"
                value={newDirectoryName}
                onChange={(e) => setNewDirectoryName(e.target.value)}
                placeholder="Enter directory name"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreateDirectory} disabled={createDirectoryMutation.isPending}>
              {createDirectoryMutation.isPending ? 'Creating...' : 'Create Directory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Upload file dialog */}
      <Dialog open={isUploadFileOpen} onOpenChange={(open) => {
        // Stop event propagation when opening/closing dialogs
        setIsUploadFileOpen(open);
      }}>
        <DialogContent onClick={stopEventPropagation}>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="upload-department">Department</Label>
              <div className="font-medium">{currentDepartment || 'No department selected'}</div>
            </div>
            
            {currentSubDirectory && (
              <div className="space-y-2">
                <Label htmlFor="upload-path">Current Path</Label>
                <div className="font-medium">{currentSubDirectory}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
              />
            </div>
            
            {uploadProgress > 0 && (
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div 
                  className="bg-primary h-2.5 rounded-full" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleFileUpload} 
              disabled={!fileToUpload || uploadFileMutation.isPending}
            >
              {uploadFileMutation.isPending ? 'Uploading...' : 'Upload File'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* File details dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => {
        // Stop event propagation when opening/closing dialogs
        if (!open) setSelectedFile(null);
      }}>
        <DialogContent onClick={stopEventPropagation}>
          <DialogHeader>
            <DialogTitle>File Details</DialogTitle>
          </DialogHeader>
          {selectedFile && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>File Name</Label>
                <div className="font-medium">{selectedFile.name}</div>
              </div>
              
              <div className="space-y-2">
                <Label>Size</Label>
                <div>{formatFileSize(selectedFile.size)}</div>
              </div>
              
              <div className="space-y-2">
                <Label>Type</Label>
                <div>{selectedFile.contentType}</div>
              </div>
              
              <div className="space-y-2">
                <Label>Last Modified</Label>
                <div>{new Date(selectedFile.updated).toLocaleString()}</div>
              </div>
              
              <div className="space-y-2">
                <Label>Path</Label>
                <div className="text-sm text-muted-foreground break-all">{selectedFile.path}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => selectedFile && generateDownloadUrlMutation.mutate(selectedFile.path)}
              disabled={generateDownloadUrlMutation.isPending}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              {generateDownloadUrlMutation.isPending ? 'Downloading...' : 'Download'}
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedFile && window.confirm(`Are you sure you want to delete ${selectedFile.name}?`)) {
                  deleteFileMutation.mutate(selectedFile.path);
                }
              }}
              disabled={deleteFileMutation.isPending}
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              {deleteFileMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}