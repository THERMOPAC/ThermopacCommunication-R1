import { useEffect, useState } from "react";
import { 
  Dialog, DialogContent, DialogDescription, 
  DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Table, TableHeader, TableBody, 
  TableRow, TableHead, TableCell 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileX, FileCheck, ArrowUp, AlertCircle, X, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectItemsImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectCode: string;
}

export default function ProjectItemsImport({ 
  open, 
  onOpenChange,
  projectId,
  projectCode 
}: ProjectItemsImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset state when dialog is opened or closed
  useEffect(() => {
    if (!open) {
      setFile(null);
      setResults(null);
    }
  }, [open]);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId.toString());
      formData.append("projectCode", projectCode);
      
      const response = await fetch("/api/projects/items/import-excel", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to import project items");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setResults(data.results);
      if (data.results.imported > 0) {
        // Invalidate project items query to refresh the list
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/items`] });
        
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.results.imported} project items.`,
        });
      } else {
        toast({
          title: "No items imported",
          description: "No new project items were imported. Check the results for details.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message || "An error occurred during import",
        variant: "destructive",
      });
    },
  });

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Check file type
    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size should be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setFile(file);
  };

  const handleImport = () => {
    if (file) {
      importMutation.mutate(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Project Items</DialogTitle>
          <DialogDescription>
            Upload an Excel file containing project items to import.
            The Excel file should have the following columns: Item Code, Description, Quantity, and UOM.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <>
            <div
              className={`border-2 border-dashed rounded-lg p-10 text-center ${
                isDragging ? "border-primary bg-primary/10" : "border-border"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileCheck className="h-10 w-10 text-green-500" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    className="mt-2"
                  >
                    <X className="h-4 w-4 mr-2" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ArrowUp className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">
                    Drop your Excel file here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports .xlsx and .xls files up to 5MB
                  </p>
                  <input
                    type="file"
                    className="hidden"
                    id="file-input"
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => document.getElementById("file-input")?.click()}
                  >
                    Browse files
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={importMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!file || importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import Project Items"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-muted/50 p-4 rounded-lg flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold">{results.totalRecords}</p>
                  <p className="text-sm text-muted-foreground">Total records</p>
                </div>

                <div className="bg-green-100 p-4 rounded-lg flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-green-700">{results.imported}</p>
                  <p className="text-sm text-green-700">Imported</p>
                </div>

                <div className="bg-amber-100 p-4 rounded-lg flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-amber-700">{results.skipped}</p>
                  <p className="text-sm text-amber-700">Skipped</p>
                </div>

                <div className="bg-blue-100 p-4 rounded-lg flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {results.totalRecords > 0 
                      ? Math.round((results.imported / results.totalRecords) * 100) 
                      : 0}%
                  </p>
                  <p className="text-sm text-blue-700">Success rate</p>
                </div>
              </div>

              <Progress
                value={
                  results.totalRecords > 0
                    ? (results.imported / results.totalRecords) * 100
                    : 0
                }
                className="h-2"
              />

              {results.errors && results.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium mb-2">Issues:</p>
                  <ScrollArea className="h-60 w-full rounded-md border">
                    <div className="p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Error Message</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {results.errors.map((error: string, index: number) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell className="text-red-500">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <span>{error}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {results.imported > 0 
                    ? "Import completed. You can now view the imported items in the project details." 
                    : "No items were imported. Please check the issues and try again."}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setResults(null)}
              >
                <ArrowUp className="h-4 w-4 mr-2" />
                Upload Another File
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                {results.imported > 0 ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Close
                  </>
                ) : (
                  "Close"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}