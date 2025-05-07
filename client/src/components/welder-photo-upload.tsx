import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UploadIcon, Loader2, AlertCircle } from 'lucide-react';

interface WelderPhotoUploadProps {
  welderId?: number;
  welderCode?: string; // Added string format welderId (W-001)
  existingPhotoUrl?: string;
  onPhotoUploadSuccess?: (path: string) => void;
}

const WelderPhotoUpload: React.FC<WelderPhotoUploadProps> = ({
  welderId,
  welderCode,
  existingPhotoUrl,
  onPhotoUploadSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existingPhotoUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Fetch the actual photo URL when existingPhotoUrl contains a welder ID
  useEffect(() => {
    if (existingPhotoUrl) {
      console.log(`Fetching photo URL from: ${existingPhotoUrl}`);
      console.log(`Welder ID (for fetch): ${welderId}, Welder Code: ${welderCode}`);
      
      // Clear any existing timeout to prevent race conditions
      const fetchTimeout = setTimeout(async () => {
        try {
          console.log(`Making fetch request to: ${existingPhotoUrl}`);
          const response = await fetch(existingPhotoUrl);
          
          console.log(`Photo URL fetch response status: ${response.status}`);
          
          if (!response.ok) {
            console.error(`Failed to fetch welder photo URL: ${response.status} ${response.statusText}`);
            // Don't return early, try to read the error body
            const errorText = await response.text();
            console.error(`Error response body: ${errorText}`);
            return;
          }
          
          const data = await response.json();
          console.log(`Photo URL fetch response data:`, data);
          
          if (data.url) {
            console.log(`Setting preview to URL: ${data.url}`);
            setPreview(data.url);
          } else {
            console.warn(`No URL in response data`);
          }
        } catch (error) {
          console.error('Error fetching welder photo URL:', error);
        }
      }, 500); // Add a small delay to prevent rapid API calls
      
      // Cleanup function to clear timeout if component unmounts or dependencies change
      return () => clearTimeout(fetchTimeout);
    } else {
      console.log(`No existing photo URL provided`);
    }
  }, [existingPhotoUrl, welderId, welderCode]);
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(selectedFile.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a JPG or PNG image",
          variant: "destructive"
        });
        return;
      }
      
      // Validate file size (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image under 5MB",
          variant: "destructive"
        });
        return;
      }
      
      // Set the file and create a preview URL
      setFile(selectedFile);
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl);
      
      // Return a cleanup function to revoke the preview URL
      return () => URL.revokeObjectURL(objectUrl);
    }
  };
  
  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a photo to upload",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    console.log("Starting photo upload process");
    console.log("Uploading file:", file.name, "size:", file.size, "type:", file.type);
    console.log("Welder ID (numeric):", welderId);
    console.log("Welder Code (string):", welderCode);
    
    try {
      // Use a timestamp in the filename to ensure uniqueness
      const timestamp = new Date().getTime();
      const uniqueFileName = `welder_photo_${timestamp}_${file.name}`;
      console.log(`Using unique filename: ${uniqueFileName}`);
      
      // Read the file into an ArrayBuffer first
      console.log("Reading file as ArrayBuffer");
      let fileBuffer;
      try {
        fileBuffer = await file.arrayBuffer();
        console.log("Successfully read file as ArrayBuffer, size:", fileBuffer.byteLength);
      } catch (readError) {
        console.error("Error reading file as ArrayBuffer:", readError);
        throw new Error(`Failed to read file: ${readError instanceof Error ? readError.message : String(readError)}`);
      }
      
      // Create a new File object with the unique name to force uniqueness
      let uniqueFile;
      try {
        uniqueFile = new File([fileBuffer], uniqueFileName, {
          type: file.type,
          lastModified: Date.now()
        });
        console.log("Successfully created unique file object:", uniqueFile.name, "size:", uniqueFile.size);
      } catch (fileCreateError) {
        console.error("Error creating unique file object:", fileCreateError);
        throw new Error(`Failed to create file object: ${fileCreateError instanceof Error ? fileCreateError.message : String(fileCreateError)}`);
      }
      
      console.log("Creating FormData object");
      const formData = new FormData();
      formData.append('file', uniqueFile);
      
      // First priority: Always use the numeric welderId if available
      if (welderId) {
        console.log(`Adding numeric welder ID to form data: ${welderId}`);
        formData.append('welderId', welderId.toString());
      } 
      // Second priority: Use the welderCode (W-001 format)
      else if (welderCode) {
        console.log(`Adding welder code to form data as welderId: ${welderCode}`);
        formData.append('welderId', welderCode);
      } 
      // No ID available - can't proceed
      else {
        console.error("No welder identification available");
        throw new Error("No welder ID available for upload - please provide either welderId or welderCode");
      }
      
      // Add the welderCode as a secondary identifier (helps the server logic)
      if (welderCode && !formData.has('welderCode')) {
        console.log(`Adding welderCode as additional identifier: ${welderCode}`);
        formData.append('welderCode', welderCode);
      }
      
      // Add force override flag to tell server to forcibly replace file
      formData.append('forceOverride', 'true');
      
      // Add timestamp for cache busting
      formData.append('timestamp', timestamp.toString());
      
      // Debug log all form data fields
      console.log("Form data entries:");
      const formEntries: {[key: string]: string} = {};
      formData.forEach((value, key) => {
        formEntries[key] = value instanceof File ? value.name : String(value);
      });
      console.log(formEntries);
      
      // Use the force-upload endpoint which is designed to work without delete permissions
      const nocache = Date.now() + Math.random();
      console.log(`Using FORCE UPLOAD endpoint with nocache: ${nocache}`);
      console.log(`Sending form data to /api/force-upload/welder-photo endpoint`);
      
      // Send the request to the server
      const response = await fetch(`/api/force-upload/welder-photo?nocache=${nocache}`, {
        method: 'POST',
        body: formData,
        credentials: 'include', // Important for authenticated requests
        headers: {
          // Add cache control headers
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log("Fetch API call completed, response received");
      console.log("Response status:", response.status);
      console.log("Response status text:", response.statusText);
      // Skip logging the headers to avoid TypeScript issues
      // console.log("Response headers:", Array.from(response.headers.entries()));
      
      console.log("Upload response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upload error response:", errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || 'Failed to upload photo');
        } catch (jsonError) {
          throw new Error(`Failed to upload photo: ${errorText}`);
        }
      }
      
      const data = await response.json();
      console.log("Upload success response:", data);
      
      // Call the success callback with the file path
      if (onPhotoUploadSuccess && data.path) {
        console.log(`Calling success callback with path: ${data.path}`);
        onPhotoUploadSuccess(data.path);
        
        // Update the preview with the new image's signed URL if available
        if (data.url) {
          console.log(`Updating preview with new signed URL: ${data.url}`);
          setPreview(data.url);
        }
      } else {
        console.warn("Success callback not called, path:", data.path, "callback:", !!onPhotoUploadSuccess);
      }
      
      toast({
        title: "Upload successful",
        description: `Welder photo has been uploaded successfully`
      });
      
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const [isTestingGcs, setIsTestingGcs] = useState(false);
  const [gcsStatus, setGcsStatus] = useState<any>(null);
  
  // Function to test GCS connectivity
  const testGcsConnectivity = async () => {
    setIsTestingGcs(true);
    try {
      console.log("Testing GCS connectivity...");
      const response = await fetch('/api/test/gcs-connectivity', {
        credentials: 'include' // Important for authenticated requests
      });
      
      console.log("GCS test response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("GCS test error:", errorText);
        toast({
          title: "GCS Test Failed",
          description: `Status: ${response.status} - ${errorText}`,
          variant: "destructive"
        });
        return;
      }
      
      const data = await response.json();
      console.log("GCS connectivity test result:", data);
      setGcsStatus(data);
      
      toast({
        title: data.success ? "GCS Connection Success" : "GCS Connection Failed",
        description: `Bucket: ${data.bucketName}, Write: ${data.canWrite ? 'Yes' : 'No'}, Read: ${data.bucketExists ? 'Yes' : 'No'}`,
        variant: data.success && data.canWrite ? "default" : "destructive"
      });
    } catch (error) {
      console.error("Error testing GCS connectivity:", error);
      toast({
        title: "GCS Test Error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsTestingGcs(false);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-4">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-32 w-32">
            {preview ? (
              <AvatarImage src={preview} alt="Welder photo" />
            ) : (
              <AvatarFallback className="text-2xl bg-muted">
                Photo
              </AvatarFallback>
            )}
          </Avatar>
          
          <div className="w-full space-y-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            
            <Button 
              type="button" 
              onClick={handleUpload} 
              disabled={!file || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Upload Photo
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WelderPhotoUpload;