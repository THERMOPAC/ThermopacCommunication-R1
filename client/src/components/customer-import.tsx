import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CustomerImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CustomerImport: React.FC<CustomerImportProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<{
    totalRecords?: number;
    imported?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/customers/import-excel', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to import customers');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      setImportResults(data.results);
      toast({
        title: "Import Successful",
        description: `Successfully imported ${data.results.imported} customer records.`,
      });
      // Invalidate customers query to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = () => {
    if (selectedFile) {
      importMutation.mutate(selectedFile);
    } else {
      toast({
        title: "No File Selected",
        description: "Please select an Excel file to import.",
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setImportResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
          <DialogDescription>
            Upload an Excel file containing customer data. The file should have columns for BP Code, BP Name, Contact Person, Email, Continent, and Country.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {!importResults ? (
            <>
              <div 
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted transition-colors"
                onClick={handleButtonClick}
              >
                <div className="bg-muted-foreground/20 p-4 rounded-full">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <p><span className="font-medium">Click to upload</span> or drag and drop</p>
                  <p className="text-sm text-muted-foreground">Excel files only (XLSX, XLS)</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>

              {selectedFile && (
                <Alert variant="outline" className="bg-primary/5">
                  <FileSpreadsheet className="h-4 w-4" />
                  <AlertDescription className="flex items-center gap-2">
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-muted-foreground text-xs">
                      ({Math.round(selectedFile.size / 1024)} KB)
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-green-50 rounded-lg p-4 text-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium">Import completed</p>
                  <p className="text-sm">
                    {importResults.totalRecords} records processed, {importResults.imported} imported, {importResults.skipped} skipped
                  </p>
                </div>
              </div>
              
              {importResults.errors && importResults.errors.length > 0 && (
                <div className="rounded-lg border p-4 max-h-[200px] overflow-y-auto">
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Warnings and Errors
                  </h4>
                  <ul className="text-sm mt-2 space-y-1">
                    {importResults.errors.map((error, index) => (
                      <li key={index} className="text-muted-foreground">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!importResults ? (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={!selectedFile || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Customers
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerImport;