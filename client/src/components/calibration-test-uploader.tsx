import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

/**
 * Test component for isolating and debugging file upload issues
 */
export function CalibrationTestUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      console.log("File selected:", selectedFile.name);
    }
  };
  
  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadResult(null);
      
      // Create form data
      const formData = new FormData();
      formData.append("file", file);
      
      // Make request to test endpoint
      const response = await fetch('/api/calibration-test/upload-test', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });
      
      // Log response information for debugging
      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);
      
      // Handle response
      let result;
      if (response.headers.get('content-type')?.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("Received non-JSON response:", text.substring(0, 200));
        throw new Error(`Server returned unexpected content type: ${response.headers.get('content-type') || 'unknown'}`);
      }
      
      // Set result for display
      setUploadResult(result);
      
      // Show success message
      if (result.success) {
        toast({
          title: "Upload successful",
          description: `File ${file.name} uploaded successfully`,
        });
      } else {
        toast({
          title: "Upload failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Calibration Certificate Upload Test</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Certificate File
          </label>
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          {file && (
            <p className="text-sm mt-1">Selected file: {file.name}</p>
          )}
        </div>
        
        {uploadResult && (
          <div className="mt-4 p-4 border rounded bg-slate-50">
            <h3 className="font-medium mb-2">Upload Result:</h3>
            <pre className="text-xs overflow-auto max-h-60">
              {JSON.stringify(uploadResult, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={handleUpload} 
          disabled={!file || isUploading}
          className="w-full"
        >
          {isUploading ? "Uploading..." : "Test Upload"}
        </Button>
      </CardFooter>
    </Card>
  );
}