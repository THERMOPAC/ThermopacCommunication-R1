import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Upload, XCircle, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { canManageContent } from '@/lib/permissions';

const MasterItemsImport: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any | null>(null);
  const [errors, setErrors] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setErrors(null);
      setUploadResults(null);
    }
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // Check if it's an Excel file
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          file.type === 'application/vnd.ms-excel' ||
          file.name.endsWith('.xlsx') || 
          file.name.endsWith('.xls') ||
          file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setErrors(null);
        setUploadResults(null);
      } else {
        setErrors('Please select a valid Excel file (.xlsx, .xls, or .csv)');
      }
    }
  };
  
  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadResults(null);
    setErrors(null);
  };
  
  const handleUpload = async () => {
    if (!selectedFile) {
      setErrors('Please select a file to upload');
      return;
    }
    
    try {
      setIsUploading(true);
      setErrors(null);
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const response = await fetch('/api/master-items/import-excel', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setUploadResults(result.results);
        if (result.results.created > 0) {
          toast({
            title: 'Upload Successful',
            description: `Successfully imported ${result.results.created} master items`,
            duration: 5000,
          });
          
          // Invalidate queries to refresh the items list
          queryClient.invalidateQueries({ queryKey: ['/api/master-items'] });
        } else {
          toast({
            title: 'Upload Complete',
            description: 'No new items were added. Check for duplicates or errors.',
            variant: 'destructive',
            duration: 5000,
          });
        }
      } else {
        setErrors(result.error || 'An error occurred during import');
        toast({
          title: 'Upload Failed',
          description: result.error || 'Failed to import master items',
          variant: 'destructive',
          duration: 5000,
        });
      }
    } catch (error) {
      setErrors('Error uploading file. Please try again.');
      toast({
        title: 'Upload Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Check user permissions
  const canImport = user && canManageContent(user.role, 'Manager');
  
  if (!canImport) {
    return null;
  }
  
  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-2">
          <Upload className="h-4 w-4 mr-2" /> Import Items
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Import Master Items</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx, .xls) or CSV file containing master items data.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div 
            className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer ${
              errors ? 'border-destructive' : 'border-primary/20 hover:border-primary/50'
            }`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="flex items-center justify-center space-x-2">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                >
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  Drag and drop your file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Excel (.xlsx, .xls) and CSV files
                </p>
              </div>
            )}
          </div>
          
          {errors && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">
              {errors}
            </div>
          )}
          
          {uploadResults && (
            <div className="text-sm p-3 bg-muted rounded-md">
              <p className="font-medium mb-1">Import Results:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Total rows: {uploadResults.total}</li>
                <li>Successfully imported: {uploadResults.created}</li>
                <li>Skipped: {uploadResults.skipped}</li>
                {uploadResults.errors.length > 0 && (
                  <li className="text-destructive">
                    Failed items: {uploadResults.errors.length}
                    <ul className="list-disc list-inside ml-4 mt-1">
                      {uploadResults.errors.slice(0, 3).map((err: any, idx: number) => (
                        <li key={idx}>
                          {err.row?.['Item Code'] || 'Unknown item'}: {err.error}
                        </li>
                      ))}
                      {uploadResults.errors.length > 3 && (
                        <li>...and {uploadResults.errors.length - 3} more errors</li>
                      )}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          )}
          
          <div className="mt-2">
            <Label className="text-sm font-medium mb-1 block">Excel Format Requirements:</Label>
            <p className="text-xs text-muted-foreground">
              Your Excel file should include these columns: Item Code, Description, UOM, Make/Buy, and Drawing No.
              Optional columns: Supplier, Specification, Standard Cost, and Notes.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>Field flexibility:</strong> The system will recognize variations of column names, for example:
              "UOM" or "Unit of Measure", "Make/Buy" or "MakeOrBuy", "Drawing No" or "DrawingNo".
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MasterItemsImport;