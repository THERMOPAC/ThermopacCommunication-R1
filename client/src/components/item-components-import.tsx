import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, FileText, AlertCircle, CheckCircle, Download, Upload } from "lucide-react";
import { apiRequest } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface ItemComponentsImportProps {
  parentItemId: number;
  parentItemCode: string;
  onImportComplete: () => void;
}

interface ImportResults {
  totalRecords: number;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Component for importing sub-assembly components from Excel
 */
export function ItemComponentsImport({ 
  parentItemId, 
  parentItemCode,
  onImportComplete 
}: ItemComponentsImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        setError('Please select an Excel file (.xlsx or .xls)');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
    }
  };

  // Handle file upload and import
  const handleImport = async () => {
    if (!file) {
      setError('Please select a file to import');
      return;
    }

    setIsUploading(true);
    setError(null);
    setResults(null);

    try {
      // Create form data to send the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parentItemId', parentItemId.toString());
      formData.append('parentItemCode', parentItemCode);

      console.log('Uploading components for master item:', {
        parentItemId,
        parentItemCode,
        fileName: file.name
      });

      // Send POST request to import API
      // Set parseJson to false to get the raw response object since we need to check response.ok
      const response = await apiRequest('POST', '/api/master-items/components/import-excel', formData, true, false) as Response;
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to import components');
      }
      
      // Now parse the JSON after confirming it's a successful response
      const data = await response.json();
      console.log('Import results:', data);
      setResults(data.results);
      
      // Notify parent component
      onImportComplete();
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during import');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setResults(null);
    setError(null);
  };

  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/api/master-items/components/sample-excel', {
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
      link.download = 'item_components_sample.xlsx';
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast({
        title: "Sample Downloaded",
        description: "Item components sample file has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download sample file. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-h-[80vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>Import Sub-Assembly Components</CardTitle>
        <CardDescription>
          Upload an Excel file with component item codes and quantities for parent item: <strong>{parentItemCode}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <div><strong>Item Code</strong> - Component item identifier (required)</div>
            <div><strong>Quantity</strong> - Numeric quantity per assembly (required)</div>
          </div>
          <h4 className="text-sm font-medium mt-4">Optional Excel columns:</h4>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div><strong>Description</strong> - Component description</div>
            <div><strong>UOM</strong> - Unit of measurement</div>
            <div><strong>Make/Buy</strong> - Manufacturing classification</div>
            <div><strong>Drawing No</strong> - Associated drawing number</div>
          </div>
        </div>

        <Separator />
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && (
          <Alert className="mb-4" variant={results.errors.length > 0 ? "destructive" : "default"}>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Import Completed</AlertTitle>
            <AlertDescription>
              <div>Total Records: {results.totalRecords}</div>
              <div>Imported: {results.imported}</div>
              <div>Skipped: {results.skipped}</div>
              {results.errors.length > 0 && (
                <div className="mt-2">
                  <strong>Errors:</strong>
                  <ul className="list-disc pl-5 mt-1 text-sm">
                    {results.errors.slice(0, 5).map((err, index) => (
                      <li key={index}>{err}</li>
                    ))}
                    {results.errors.length > 5 && (
                      <li>...and {results.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading}
                className="cursor-pointer"
              />
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{file.name}</span>
              <span className="text-xs">({(file.size / 1024).toFixed(2)} KB)</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={resetForm}
          disabled={isUploading}
        >
          Reset
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={!file || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Import Components'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}