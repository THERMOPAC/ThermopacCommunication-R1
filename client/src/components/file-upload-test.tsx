import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileUp, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';

/**
 * File Upload Test Component for GCS Diagnostics
 * Tests uploading files to Google Cloud Storage with detailed diagnostics
 */
export default function FileUploadTest() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const startTime = performance.now();
      
      const response = await apiRequest('POST', '/api/test/file-upload', formData);
      
      const data = await response.json();
      
      if (response.ok) {
        setUploadResult(data);
      } else {
        setError(data.error || 'File upload failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setError(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Test File Upload to GCS</CardTitle>
            <CardDescription>
              Test direct file uploads to Google Cloud Storage
            </CardDescription>
          </div>
          <Badge variant={uploadResult?.success ? 'success' : error ? 'destructive' : 'outline'}>
            {uploadResult?.success ? 'Success' : error ? 'Failed' : 'Ready'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col space-y-3">
            <label className="font-medium" htmlFor="test-file-upload">
              Select test file to upload
            </label>
            <input
              ref={fileInputRef}
              id="test-file-upload"
              type="file"
              onChange={handleFileChange}
              className="border border-input rounded-md p-2"
              disabled={isUploading}
            />
            {file && (
              <div className="text-sm text-muted-foreground">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB, {file.type})
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="flex items-center"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Upload Test File
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isUploading}
            >
              Reset
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {uploadResult && (
            <div className="space-y-3">
              <Alert variant={uploadResult.success ? 'success' : 'destructive'}>
                {uploadResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>Upload {uploadResult.success ? 'Successful' : 'Failed'}</AlertTitle>
                <AlertDescription>
                  {uploadResult.success 
                    ? `File was successfully uploaded to Google Cloud Storage` 
                    : uploadResult.error}
                </AlertDescription>
              </Alert>

              {uploadResult.success && (
                <div className="p-4 bg-secondary/50 rounded-md space-y-2">
                  <h4 className="font-medium flex items-center">
                    <Info className="h-4 w-4 mr-2" />
                    Upload Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">Path:</span> {uploadResult.filePath}
                    </div>
                    <div>
                      <span className="font-medium">File:</span> {uploadResult.fileDetails?.name}
                    </div>
                    <div>
                      <span className="font-medium">Size:</span> {Math.round(uploadResult.fileDetails?.size / 1024)} KB
                    </div>
                    <div>
                      <span className="font-medium">Type:</span> {uploadResult.fileDetails?.type}
                    </div>
                    <div>
                      <span className="font-medium">Upload time:</span> {uploadResult.uploadTime}ms
                    </div>
                    <div>
                      <span className="font-medium">Speed:</span> {uploadResult.uploadSpeed}
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open(uploadResult.url, '_blank')}
                    >
                      View File
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}