import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

/**
 * Test component for debugging GCS upload and listing capabilities
 */
export function GCSTestUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [isListing, setIsListing] = useState(false);
  const [listingResult, setListingResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [listingPath, setListingPath] = useState('QMS/Instrument');
  const { toast } = useToast();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      console.log("File selected:", selectedFile.name);
    }
  };
  
  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setListingPath(e.target.value);
  };
  
  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      
      const response = await fetch('/api/testapi/calibration/test-gcs-connection', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      console.log("Test connection response status:", response.status);
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log("Test connection result:", data);
        setTestResult(data);
        
        if (data.success) {
          toast({
            title: "GCS Connection Test Complete",
            description: `Success: ${data.data.success}, Write: ${data.data.canWrite}, Read: ${data.data.canRead}, List: ${data.data.canList}`,
            variant: data.data.success ? "default" : "destructive",
          });
        } else {
          toast({
            title: "GCS Connection Test Failed",
            description: data.message || "Unknown error",
            variant: "destructive",
          });
        }
      } else {
        const text = await response.text();
        console.error("Received non-JSON response:", text);
        setTestResult({ error: "Received non-JSON response" });
        toast({
          title: "Invalid Response",
          description: "Received non-JSON response from server",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error testing GCS connection:", error);
      setTestResult({ error: String(error) });
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
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
      formData.append("certificate", file);
      
      // Make request to test upload endpoint
      const response = await fetch('/api/testapi/calibration/test-upload-certificate', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
      });
      
      console.log("Test upload response status:", response.status);
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log("Test upload result:", data);
        setUploadResult(data);
        
        if (data.success) {
          toast({
            title: "Test Upload Complete",
            description: `Instrument ID: ${data.testInstrumentId}`,
          });
        } else {
          toast({
            title: "Test Upload Failed",
            description: data.message || "Unknown error",
            variant: "destructive",
          });
        }
      } else {
        const text = await response.text();
        console.error("Received non-JSON response:", text);
        setUploadResult({ error: "Received non-JSON response" });
        toast({
          title: "Invalid Response",
          description: "Received non-JSON response from server",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error uploading test file:", error);
      setUploadResult({ error: String(error) });
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleListFiles = async () => {
    try {
      setIsListing(true);
      setListingResult(null);
      
      // Make request to list files endpoint
      const response = await fetch(`/api/testapi/calibration/list-gcs-files?path=${encodeURIComponent(listingPath)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      console.log("List files response status:", response.status);
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log("List files result:", data);
        setListingResult(data);
        
        if (data.success) {
          toast({
            title: "Files Listed",
            description: `Found ${data.fileCount} files in ${data.path}`,
          });
        } else {
          toast({
            title: "Listing Failed",
            description: data.message || "Unknown error",
            variant: "destructive",
          });
        }
      } else {
        const text = await response.text();
        console.error("Received non-JSON response:", text);
        setListingResult({ error: "Received non-JSON response" });
        toast({
          title: "Invalid Response",
          description: "Received non-JSON response from server",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error listing files:", error);
      setListingResult({ error: String(error) });
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsListing(false);
    }
  };
  
  return (
    <Tabs defaultValue="test" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="test">Test Connection</TabsTrigger>
        <TabsTrigger value="upload">Test Upload</TabsTrigger>
        <TabsTrigger value="list">List Files</TabsTrigger>
      </TabsList>
      
      <TabsContent value="test">
        <Card>
          <CardHeader>
            <CardTitle>Test GCS Connection</CardTitle>
            <CardDescription>
              Test if the application can connect to Google Cloud Storage and perform basic operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleTestConnection} 
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? "Testing Connection..." : "Test GCS Connection"}
            </Button>
            
            {testResult && (
              <div className="mt-4 p-4 border rounded-md bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">Test Results:</h3>
                <pre className="text-xs overflow-auto max-h-80 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="upload">
        <Card>
          <CardHeader>
            <CardTitle>Test File Upload</CardTitle>
            <CardDescription>
              Upload a test file to GCS and verify the upload process.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.jpg,.jpeg,.png"
              />
              <p className="text-xs text-slate-500 mt-1">
                Select a PDF or image file for upload testing
              </p>
            </div>
            
            <Button 
              onClick={handleUpload} 
              disabled={isUploading || !file}
              className="w-full"
            >
              {isUploading ? "Uploading..." : "Test Upload"}
            </Button>
            
            {uploadResult && (
              <div className="mt-4 p-4 border rounded-md bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">Upload Results:</h3>
                <pre className="text-xs overflow-auto max-h-80 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                  {JSON.stringify(uploadResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="list">
        <Card>
          <CardHeader>
            <CardTitle>List GCS Files</CardTitle>
            <CardDescription>
              List files in a specific directory in Google Cloud Storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                type="text"
                value={listingPath}
                onChange={handlePathChange}
                placeholder="QMS/Instrument"
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter a directory path to list files from (e.g., QMS/Instrument)
              </p>
            </div>
            
            <Button 
              onClick={handleListFiles} 
              disabled={isListing}
              className="w-full"
            >
              {isListing ? "Listing Files..." : "List Files"}
            </Button>
            
            {listingResult && (
              <div className="mt-4 p-4 border rounded-md bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">
                  Found {listingResult.fileCount || 0} files in {listingResult.path}:
                </h3>
                <pre className="text-xs overflow-auto max-h-80 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                  {JSON.stringify(listingResult.files || [], null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}