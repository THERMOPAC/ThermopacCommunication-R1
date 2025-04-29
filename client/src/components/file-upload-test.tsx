import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Upload, Loader2, Check, X, FileText } from 'lucide-react';
import { toast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

/**
 * A comprehensive test component for file uploads to test GCS connectivity
 * This component uploads any file to GCS and provides detailed logging of the entire process
 */
const FileUploadTest: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'preparing' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [response, setResponse] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      addLog(`File selected: ${selectedFile.name} (${selectedFile.size} bytes, ${selectedFile.type})`);
    }
  };
  
  const resetUpload = () => {
    setFile(null);
    setUploadStatus('idle');
    setProgress(0);
    setResponse(null);
    setLogs([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setUploadStatus('preparing');
      addLog('Preparing upload...');
      setProgress(10);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('testUpload', 'true');
      
      addLog(`Creating FormData with file: ${file.name}`);
      setProgress(20);
      
      // Set up request
      const controller = new AbortController();
      const signal = controller.signal;
      
      addLog('Sending file to /api/test/file-upload endpoint...');
      setUploadStatus('uploading');
      setProgress(30);
      
      // Make the request
      const response = await fetch('/api/test/file-upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal
      });
      
      setProgress(90);
      
      // Handle response
      const responseData = await response.json();
      setResponse(responseData);
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to upload file');
      }
      
      addLog(`Server response received: ${JSON.stringify(responseData)}`);
      setProgress(100);
      setUploadStatus('success');
      
      toast({
        title: "Upload successful",
        description: `File "${file.name}" uploaded successfully`,
      });
      
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setUploadStatus('error');
      setProgress(100);
      
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
      
      setResponse({
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>File Upload Test</CardTitle>
        <CardDescription>
          Test GCS connectivity by uploading any file to the test endpoint
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload-test"
          />
          
          {file ? (
            <div className="border rounded-md p-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB • {file.type || 'Unknown type'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div 
              className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Click to select a file</p>
              <p className="text-xs text-muted-foreground mt-1">
                Any file format, max 10MB
              </p>
            </div>
          )}
        </div>
        
        {uploadStatus !== 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {uploadStatus === 'preparing' && 'Preparing...'}
                {uploadStatus === 'uploading' && 'Uploading...'}
                {uploadStatus === 'success' && 'Upload Complete'}
                {uploadStatus === 'error' && 'Upload Failed'}
              </span>
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}
        
        {response && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Response</h3>
              <div className="bg-muted p-3 rounded-md text-xs font-mono max-h-40 overflow-auto">
                <pre>{JSON.stringify(response, null, 2)}</pre>
              </div>
            </div>
          </>
        )}
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Upload Logs</h3>
            <Badge variant="outline" className="text-xs">
              {logs.length} entries
            </Badge>
          </div>
          <div className="bg-muted p-3 rounded-md text-xs font-mono h-40 overflow-auto">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="py-0.5">
                  {log}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground italic">
                No logs yet. Select a file and start the upload to see logs here.
              </div>
            )}
          </div>
        </div>
        
        {uploadStatus === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Failed</AlertTitle>
            <AlertDescription>
              {response?.error || "There was an error uploading your file. Please try again."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={resetUpload}
          disabled={uploadStatus === 'uploading'}
        >
          Reset
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!file || uploadStatus === 'uploading'}
        >
          {uploadStatus === 'uploading' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : uploadStatus === 'success' ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Uploaded
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default FileUploadTest;