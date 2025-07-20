import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileSpreadsheet, Check, X, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface ProjectItemsImportProps {
  projectId: number;
  projectCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

interface ImportResults {
  totalRecords: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export function ProjectItemsImport({ 
  projectId, 
  projectCode, 
  open, 
  onOpenChange, 
  onImportComplete 
}: ProjectItemsImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Check if it's an Excel file
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        setErrorMessage("Please select an Excel file (.xlsx or .xls)");
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      setFile(selectedFile);
      setErrorMessage(null);
    }
  };

  const resetForm = () => {
    setFile(null);
    setResults(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/api/projects/items/sample-excel', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download sample file');
      }

      // Create blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'project_items_sample.xlsx';
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast({
        title: "Sample Downloaded",
        description: "Project items sample file has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download sample file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setErrorMessage("Please select a file to upload");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Log the types and values to debug
      console.log('Project ID type:', typeof projectId, 'value:', projectId);
      console.log('Project Code type:', typeof projectCode, 'value:', projectCode);
      
      // Always ensure we're sending the numeric project ID
      formData.append('projectId', String(projectId));
      formData.append('projectCode', projectCode);
      
      const response = await fetch('/api/projects/items/import-excel', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        try {
          const data = await response.json();
          console.error('Import error response:', data);
          
          // Handle database connection errors specifically
          if (data.message && data.message.includes('database') && data.message.includes('connection')) {
            throw new Error('Database connection error: Please try again in a moment');
          }
          
          throw new Error(data.message || 'Failed to import project items');
        } catch (jsonError) {
          // If we can't parse the response as JSON
          console.error('Error parsing error response:', jsonError);
          console.error('Response status:', response.status);
          const responseText = await response.text().catch(() => 'Could not read response text');
          console.error('Response text:', responseText);
          
          // Check if the response includes database connection errors
          if (responseText.includes('database') && (responseText.includes('connection') || responseText.includes('terminating'))) {
            throw new Error('Database connection error: Please try again after a moment');
          }
          
          throw new Error(`Server error (${response.status}): Failed to import project items`);
        }
      }
      
      // Check if there's actual content to parse before trying to parse JSON
      const contentLength = response.headers.get('content-length');
      const hasContent = contentLength && parseInt(contentLength) > 0;
      
      let data;
      if (response.status === 204 || !hasContent) {
        // No content response
        data = { results: { imported: 0, skipped: 0 } };
      } else {
        try {
          data = await response.json();
        } catch (error) {
          console.error('Error parsing successful response:', error);
          // Provide a default response if JSON parsing fails
          data = { results: { imported: 0, skipped: 0 } };
        }
      }
      setResults(data.results);
      
      if (data.results.imported > 0) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${data.results.imported} project items.`,
        });
        
        // Notify parent component that import is complete
        onImportComplete();
      }
    } catch (error) {
      console.error('Error importing project items:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Project Items</DialogTitle>
          <DialogDescription>
            Upload an Excel file to import project items for project: <strong>{projectCode}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sample Download Section */}
          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">Need the correct format?</h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Download our sample Excel file to see the required format and example data
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadSample}
                className="ml-4 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Sample
              </Button>
            </div>
          </div>

          {/* Field Descriptions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Required Excel columns:</h4>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div><strong>Item Code</strong> - Unique item identifier (required)</div>
              <div><strong>Description</strong> - Detailed item description (required)</div>
              <div><strong>Quantity</strong> - Numeric quantity value (required)</div>
              <div><strong>UOM</strong> - Unit of measurement (required)</div>
            </div>
            <h4 className="text-sm font-medium mt-4">Optional Excel columns:</h4>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div><strong>Make or Buy</strong> - Manufacturing classification</div>
              <div><strong>Drawing No</strong> - Associated drawing number</div>
              <div><strong>Specification</strong> - Technical specifications</div>
              <div><strong>Make</strong> - Manufacturer information</div>
              <div><strong>Source Type</strong> - Sourcing classification</div>
              <div><strong>Supplier</strong> - Supplier details</div>
            </div>
          </div>

          <Separator />

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {errorMessage && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="file" className="text-right">
                Excel File
              </Label>
              <div className="col-span-3">
                <Input
                  id="file"
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {results && (
              <div className="mt-4 space-y-4">
                <Separator />
                
                <div className="flex justify-between text-sm">
                  <span>Total Records:</span>
                  <span className="font-medium">{results.totalRecords}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span>Successfully Imported:</span>
                  <span className="text-green-600 font-medium">{results.imported}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span>Skipped:</span>
                  <span className="text-amber-600 font-medium">{results.skipped}</span>
                </div>
                
                {results.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-sm mb-2">Import Errors:</h4>
                    <div className="max-h-40 overflow-y-auto border rounded p-2 text-sm">
                      <ul className="space-y-1">
                        {results.errors.map((error, index) => (
                          <li key={index} className="text-red-600 flex items-start gap-2">
                            <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {results.imported > 0 && (
                  <div className="flex items-center justify-center gap-2 text-green-600 font-medium p-2 bg-green-50 rounded">
                    <Check className="h-5 w-5" />
                    <span>Successfully imported {results.imported} items</span>
                  </div>
                )}
              </div>
            )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={loading}
              >
                {results && results.imported > 0 ? "Done" : "Cancel"}
              </Button>
              
              {(!results || results.imported === 0) && (
                <Button 
                  type="submit"
                  disabled={!file || loading}
                >
                  {loading ? "Importing..." : "Import Project Items"}
                </Button>
              )}
              
              {results && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={loading}
                >
                  Import Another File
                </Button>
              )}
            </div>
          </form>

          <div className="mt-4 p-4 bg-slate-50 rounded text-sm">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Excel Format Requirements
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>Required columns: Item Code, Description, Quantity, UOM</li>
              <li>Optional columns: Specification, Make, Source Type, Supplier, Make or Buy, Drawing No</li>
              <li>First row should be column headers</li>
              <li>Item Code must be unique within the project</li>
              <li>Make or Buy should be "Make" or "Buy" (or "M"/"B" abbreviations)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}