import React, { useState, useEffect } from 'react';
import { FolderIcon, FileIcon, DownloadIcon, TrashIcon, FolderPlusIcon, UploadIcon } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
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

interface ItemFileStorageProps {
  itemId: number;
  itemCode: string;
}

interface FileItem {
  name: string;
  path: string;
  size: number;
  contentType: string;
  updated: string;
  created: string;
}

const ItemFileStorage: React.FC<ItemFileStorageProps> = ({ itemId, itemCode }) => {
  const [currentPath, setCurrentPath] = useState<string>(`items/${itemCode}`);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>(['Items', itemCode]);

  // Query to get files in the current directory
  const filesQuery = useQuery({
    queryKey: ['item-files', currentPath],
    queryFn: async () => {
      const url = `/api/storage/files?path=${encodeURIComponent(currentPath)}`;
      const response = await apiRequest('GET', url);
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return response.json();
    }
  });

  // Mutation to upload a file
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', currentPath);

      // First, request an upload URL
      const uploadUrlResponse = await apiRequest('POST', '/api/storage/upload-url', {
        fileName: file.name,
        contentType: file.type,
        path: currentPath,
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { url, fields } = await uploadUrlResponse.json();

      // Create a new FormData for the actual upload
      const uploadFormData = new FormData();
      // Add the fields from the signed URL response
      Object.entries(fields).forEach(([key, value]) => {
        uploadFormData.append(key, value as string);
      });
      // Add the file as the last field
      uploadFormData.append('file', file);

      // Upload directly to Google Cloud Storage
      const uploadResponse = await fetch(url, {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['item-files', currentPath] });
      setUploadFile(null);
      setIsUploadDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to create a new folder
  const createFolderMutation = useMutation({
    mutationFn: async (folderName: string) => {
      const response = await apiRequest('POST', '/api/storage/directories', {
        path: `${currentPath}/${folderName}`,
      });
      if (!response.ok) {
        throw new Error('Failed to create folder');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Folder created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['item-files', currentPath] });
      setNewFolderName('');
      setIsNewFolderDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to delete a file
  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const response = await apiRequest('DELETE', '/api/storage/files', {
        path: filePath,
      });
      if (!response.ok) {
        throw new Error('Failed to delete file');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['item-files', currentPath] });
      setSelectedFile(null);
      setIsConfirmDeleteOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation to generate a download URL
  const downloadUrlMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const url = `/api/storage/download-url?path=${encodeURIComponent(filePath)}`;
      const response = await apiRequest('GET', url);
      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Open the download URL in a new tab
      window.open(data.url, '_blank');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle file upload
  const handleFileUpload = () => {
    if (uploadFile) {
      uploadMutation.mutate(uploadFile);
    }
  };

  // Handle folder creation
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate(newFolderName.trim());
    }
  };

  // Handle navigation to a subdirectory
  const handleNavigateToFolder = (folderName: string) => {
    const newPath = `${currentPath}/${folderName}`;
    setCurrentPath(newPath);
    
    // Update breadcrumb path
    setBreadcrumbPath([...breadcrumbPath, folderName]);
  };

  // Handle navigation via breadcrumb
  const handleBreadcrumbNavigation = (index: number) => {
    if (index === 0) {
      // Root level - items
      setCurrentPath(`items/${itemCode}`);
      setBreadcrumbPath(['Items', itemCode]);
    } else if (index > 0 && index < breadcrumbPath.length) {
      // Navigate to intermediate level
      const newPath = ['items', itemCode, ...breadcrumbPath.slice(2, index + 1)].join('/');
      setCurrentPath(newPath);
      setBreadcrumbPath(breadcrumbPath.slice(0, index + 1));
    }
  };

  // Handle file selection
  const handleFileSelect = (file: FileItem) => {
    setSelectedFile(file);
  };

  // Handle file download
  const handleDownloadFile = () => {
    if (selectedFile) {
      downloadUrlMutation.mutate(selectedFile.path);
    }
  };

  // Handle file deletion
  const handleDeleteFile = () => {
    if (selectedFile) {
      deleteFileMutation.mutate(selectedFile.path);
    }
  };

  return (
    <div className="w-full">
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle>File Storage for {itemCode}</CardTitle>
          <CardDescription>
            Manage files related to this master item
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbPath.map((part, index) => (
                  <React.Fragment key={`${part}-${index}`}>
                    <BreadcrumbItem>
                      <BreadcrumbLink 
                        onClick={() => handleBreadcrumbNavigation(index)}
                        className="cursor-pointer"
                      >
                        {part}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {index < breadcrumbPath.length - 1 && (
                      <BreadcrumbSeparator />
                    )}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex justify-end space-x-2 mb-4">
            <Button
              variant="outline"
              onClick={() => setIsNewFolderDialogOpen(true)}
              disabled={createFolderMutation.isPending}
            >
              <FolderPlusIcon className="h-4 w-4 mr-2" />
              New Folder
            </Button>
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              disabled={uploadMutation.isPending}
            >
              <UploadIcon className="h-4 w-4 mr-2" />
              Upload File
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filesQuery.isLoading ? (
              <div className="col-span-full flex justify-center py-8">
                <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-primary rounded-full"></div>
              </div>
            ) : filesQuery.error ? (
              <div className="col-span-full text-red-500 text-center py-8">
                Error loading files: {(filesQuery.error as Error).message}
              </div>
            ) : filesQuery.data && Array.isArray(filesQuery.data) && filesQuery.data.length > 0 ? (
              filesQuery.data.map((file: FileItem) => {
                const isFolder = file.contentType === 'folder';
                const isSelected = selectedFile && selectedFile.path === file.path;
                
                return (
                  <div 
                    key={file.path}
                    className={`p-3 border rounded-md cursor-pointer flex items-center ${isSelected ? 'bg-muted border-primary' : 'hover:bg-muted/50'}`}
                    onClick={() => isFolder ? handleNavigateToFolder(file.name) : handleFileSelect(file)}
                  >
                    {isFolder ? (
                      <FolderIcon className="h-6 w-6 mr-2 text-yellow-500" />
                    ) : (
                      <FileIcon className="h-6 w-6 mr-2 text-blue-500" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      {!isFolder && (
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full text-center text-muted-foreground py-8">
                No files found in this directory
              </div>
            )}
          </div>
        </CardContent>
        {selectedFile && (
          <CardFooter className="border-t px-6 py-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)} • Last modified: {new Date(selectedFile.updated).toLocaleString()}
                </p>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadFile}
                  disabled={downloadUrlMutation.isPending}
                >
                  <DownloadIcon className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsConfirmDeleteOpen(true)}
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Select a file to upload to the current directory:
              <span className="font-semibold block mt-1">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleFileUpload} 
              disabled={!uploadFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder to create in:
              <span className="font-semibold block mt-1">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folderName">Folder Name</Label>
              <Input
                id="folderName"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. Documents"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleCreateFolder} 
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFile?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              variant="destructive" 
              onClick={handleDeleteFile}
              disabled={deleteFileMutation.isPending}
            >
              {deleteFileMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ItemFileStorage;