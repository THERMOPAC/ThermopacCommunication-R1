import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileSpreadsheet, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from '@/components/ui/card';

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

export function ItemComponentsImport({ 
  parentItemId, 
  parentItemCode, 
  onImportComplete 
}: ItemComponentsImportProps) {
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
      console.log('Parent Item ID type:', typeof parentItemId, 'value:', parentItemId);
      console.log('Parent Item Code type:', typeof parentItemCode, 'value:', parentItemCode);
      
      // Always ensure we're sending the numeric parent item ID
      formData.append('parentItemId', String(parentItemId));
      formData.append('parentItemCode', parentItemCode);
      
      const response = await fetch('/api/master-items/components/import-excel', {
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
          
          throw new Error(data.message || 'Failed to import item components');
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
          
          throw new Error(`Server error (${response.status}): Failed to import item components`);
        }
      }
      
      const data = await response.json();
      setResults(data.results);
      
      if (data.results.imported > 0) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${data.results.imported} components.`,
        });
        
        // Notify parent component that import is complete
        onImportComplete();
      }
    } catch (error) {
      console.error('Error importing item components:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-muted/50">
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            
            <div className="flex items-center space-x-2 mb-1">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Import Components</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Import sub-assembly components from an Excel file
            </p>
            
            <div className="flex items-center">
              <Input 
                id="file"
                type="file" 
                ref={fileInputRef}
                accept=".xlsx,.xls" 
                onChange={handleFileChange}
                disabled={loading}
                required
                className="text-xs w-auto flex-1 mr-2" 
              />
              <Button 
                type="submit"
                size="sm" 
                variant="outline"
                disabled={!file || loading}
              >
                {loading ? "Importing..." : "Import"}
              </Button>
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
                    <span>Successfully imported {results.imported} components</span>
                  </div>
                )}
                
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    Import Another File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="mt-4 p-4 bg-slate-50 rounded text-sm">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Excel Format Requirements
          </h4>
          <ul className="list-disc pl-5 space-y-1 text-slate-700">
            <li>Required columns: Item Code, Quantity</li>
            <li>First row should be column headers</li>
            <li>Item Code must exist in the master items</li>
            <li>Components cannot be self-referenced (parent item cannot be a component of itself)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}