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

  // State for managing upload retries
  const [uploadRetryCount, setUploadRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryTimeout, setRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [lastUploadError, setLastUploadError] = useState<{
    error: string,
    details?: string, 
    suggestion?: string,
    errorType?: string,
    shouldRetry: boolean, 
    retryDelay?: number
  } | null>(null);
  
  // Maximum retry attempts
  const MAX_RETRIES = 3;

  // Enhanced file upload utility function with improved retry and error handling
  const uploadWithRetry = async (file: File, attempt: number = 0): Promise<any> => {
    console.log(`Uploading file (attempt ${attempt + 1}): ${file.name} (${formatFileSize(file.size)}) to ${currentPath}`);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', currentPath);
      
      // Log detailed information about what we're uploading for better debugging
      console.log(`Upload details:
        - File: ${file.name} (${file.size} bytes, ${file.type})
        - Path: ${currentPath}
        - Attempt: ${attempt + 1} of ${MAX_RETRIES + 1}
      `);
      
      // Use server-side upload endpoint for more robust error handling
      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });
      
      // Parse response even if it's an error
      let data;
      let errorMessage;
      
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        // If we can't parse JSON, try to get text
        const text = await response.text();
        errorMessage = `Failed to parse server response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`;
        
        // Create a structured error object anyway
        throw {
          message: errorMessage,
          status: response.status,
          shouldRetry: response.status >= 500 || response.status === 429,
          retryDelay: 5000,
          errorType: 'parse_error'
        };
      }
      
      if (!response.ok) {
        // Extract error details from server response
        const errorDetails = data.error || {};
        
        // Use server-provided error message or construct one
        errorMessage = typeof errorDetails === 'string' 
          ? errorDetails 
          : errorDetails.message || data.errorMessage || 'Unknown server error';
            
        // Create enhanced error object with retry information from server
        const error: any = new Error(errorMessage);
        
        // Pass along all the server information for intelligent retry decisions
        error.status = response.status;
        error.shouldRetry = data.shouldRetry !== undefined 
          ? data.shouldRetry 
          : (response.status >= 500 || response.status === 429);
        error.retryDelay = data.retryDelay;
        error.details = data.details;
        error.errorType = data.errorType;
        error.suggestion = data.suggestion;
        
        // Special case for file revision conflicts
        if (response.status === 409 && data.suggestedRevision !== undefined) {
          error.message = `${errorMessage} Please use revision ${data.suggestedRevision}.`;
          error.shouldRetry = false; // Don't retry version conflicts
        }
        
        console.error('Upload error response:', data);
        throw error;
      }
      
      return data;
    } catch (error: any) {
      console.error(`Upload attempt ${attempt + 1} failed:`, error);
      
      // Ensure the error object has all the retry information we need
      if (typeof error === 'string') {
        error = new Error(error);
      }
      
      // Attempt to classify errors based on message if server didn't provide retry info
      if (error.shouldRetry === undefined) {
        const isNetworkError = error.message && (
          error.message.includes('network') || 
          error.message.includes('connection') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('socket')
        );
        
        const isServerError = error.status && error.status >= 500;
        const isRateLimitError = error.status === 429;
        
        error.shouldRetry = isNetworkError || isServerError || isRateLimitError;
        
        // Set default retry delay based on error type if not provided by server
        if (error.shouldRetry && error.retryDelay === undefined) {
          if (isRateLimitError) {
            error.retryDelay = 8000; // Longer delay for rate limiting
          } else if (isNetworkError) {
            error.retryDelay = 2000; // Shorter delay for network issues
          } else {
            error.retryDelay = 5000; // Default delay
          }
        }
      }
      
      // Update UI state with error information
      setLastUploadError({
        error: error.message,
        details: error.details,
        suggestion: error.suggestion,
        shouldRetry: error.shouldRetry,
        retryDelay: error.retryDelay,
        errorType: error.errorType
      });
      
      // Rethrow the error for the mutation's error handler
      throw error;
    }
  };

  // Mutation to upload a file with automatic retries
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let lastError = null;
      
      // Try up to MAX_RETRIES + 1 times (initial attempt + retries)
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // If this is a retry attempt, setup UI and delay
          if (attempt > 0) {
            setIsRetrying(true);
            setUploadRetryCount(attempt);
            
            // Calculate delay - either from server suggestion or exponential backoff
            const retryDelay = lastError?.retryDelay || Math.min(Math.pow(2, attempt) * 1000, 10000);
            
            console.log(`Retrying upload in ${retryDelay}ms (attempt ${attempt + 1} of ${MAX_RETRIES + 1})`);
            
            // Wait before retry using a promise instead of setTimeout
            await new Promise(resolve => {
              const timeout = setTimeout(resolve, retryDelay);
              setRetryTimeout(timeout);
            });
          }
          
          // Attempt upload
          return await uploadWithRetry(file, attempt);
        } catch (error: any) {
          lastError = error;
          
          // If we should retry and haven't exhausted retries
          if (error.shouldRetry && attempt < MAX_RETRIES) {
            console.log(`Error is retriable, will try again (${attempt + 1}/${MAX_RETRIES})`);
            // Continue to next iteration (will retry after delay)
            continue;
          }
          
          // If we shouldn't retry or have exhausted retries, throw the error
          throw error;
        }
      }
      
      // If we've tried MAX_RETRIES times and still failed, throw the last error
      if (lastError) {
        throw lastError;
      }
    },
    onSuccess: () => {
      // Reset all state
      setIsRetrying(false);
      setUploadRetryCount(0);
      setLastUploadError(null);
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        setRetryTimeout(null);
      }
      
      // Close dialog and refresh
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['item-files', currentPath] });
      
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    },
    onError: (error: Error) => {
      // Reset retry state
      setIsRetrying(false);
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        setRetryTimeout(null);
      }
      
      // Format error details with any suggested solution
      const errorDetails = (error as any).suggestion 
        ? `${error.message}. ${(error as any).suggestion}`
        : error.message;
        
      // Show toast only if we're not retrying anymore
      if (!lastUploadError?.shouldRetry || uploadRetryCount >= MAX_RETRIES) {
        toast({
          title: "Upload Failed",
          description: errorDetails,
          variant: "destructive",
        });
        
        // Reset retry count if we're done with retries
        setUploadRetryCount(0);
      }
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
      // Clear any existing retry state when starting a fresh upload
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        setRetryTimeout(null);
      }
      setIsRetrying(false);
      setUploadRetryCount(0);
      setLastUploadError(null);
      
      // Initialize the upload
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
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        // Only allow closing the dialog if we're not in the middle of an upload
        if (!uploadMutation.isPending || !open) {
          setIsUploadDialogOpen(open);
        }
      }}>
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
                disabled={uploadMutation.isPending}
              />
            </div>
            
            {/* Upload status and retry information */}
            {uploadMutation.isPending && (
              <div className="mt-2 p-3 bg-muted rounded-md">
                <div className="flex items-center">
                  <div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <div>
                    <p className="text-sm font-medium">
                      {isRetrying 
                        ? `Retrying upload (Attempt ${uploadRetryCount + 1}/${MAX_RETRIES + 1})` 
                        : 'Uploading file...'}
                    </p>
                    {uploadFile && (
                      <p className="text-xs text-muted-foreground">
                        {uploadFile.name} ({formatFileSize(uploadFile.size)})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Enhanced error information with retry status and details */}
            {lastUploadError && !uploadMutation.isPending && (
              <div className="mt-2 p-3 bg-destructive/10 text-destructive rounded-md space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Upload failed</p>
                  {lastUploadError.errorType && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {lastUploadError.errorType.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
                
                <p className="text-xs">{lastUploadError.error}</p>
                
                {lastUploadError.details && (
                  <details className="text-xs mt-1">
                    <summary className="cursor-pointer">Technical details</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[10px] font-mono bg-destructive/5 p-1 rounded">
                      {typeof lastUploadError.details === 'string' 
                        ? lastUploadError.details.substring(0, 500) 
                        : JSON.stringify(lastUploadError.details, null, 2).substring(0, 500)}
                    </p>
                  </details>
                )}
                
                {lastUploadError.suggestion && (
                  <div className="text-xs mt-1 border-l-2 border-yellow-400 pl-2">
                    <p className="font-medium">Suggestion:</p>
                    <p>{lastUploadError.suggestion}</p>
                  </div>
                )}
                
                {lastUploadError.shouldRetry && uploadRetryCount < MAX_RETRIES && (
                  <div className="bg-primary/10 text-primary mt-2 rounded-sm p-2 text-xs">
                    <p className="flex items-center">
                      <RefreshCcwIcon className="h-3 w-3 mr-1" />
                      The system will automatically retry upload
                      {lastUploadError.retryDelay ? ` in ${lastUploadError.retryDelay/1000}s` : ' shortly'}.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                // Clear any retry timeout when canceling
                if (retryTimeout) {
                  clearTimeout(retryTimeout);
                  setRetryTimeout(null);
                }
                setIsRetrying(false);
                setUploadRetryCount(0);
                setIsUploadDialogOpen(false);
              }}
              disabled={uploadMutation.isPending && !isRetrying}
            >
              {uploadMutation.isPending && !isRetrying ? 'Please wait...' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleFileUpload} 
              disabled={!uploadFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending 
                ? (isRetrying ? 'Retrying...' : 'Uploading...') 
                : 'Upload'}
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