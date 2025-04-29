import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UploadIcon, Loader2 } from 'lucide-react';

interface WelderPhotoUploadProps {
  welderId?: number;
  existingPhotoUrl?: string;
  onPhotoUploadSuccess?: (path: string) => void;
}

const WelderPhotoUpload: React.FC<WelderPhotoUploadProps> = ({
  welderId,
  existingPhotoUrl,
  onPhotoUploadSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existingPhotoUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Update preview when existingPhotoUrl changes
  useEffect(() => {
    if (existingPhotoUrl) {
      setPreview(existingPhotoUrl);
    }
  }, [existingPhotoUrl]);
  
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
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // If welderId is provided, add it to the form data
      if (welderId) {
        formData.append('welderId', welderId.toString());
      }
      
      const response = await fetch('/api/upload/welder-photo', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload photo');
      }
      
      const data = await response.json();
      
      // Call the success callback with the file path
      if (onPhotoUploadSuccess && data.path) {
        onPhotoUploadSuccess(data.path);
      }
      
      toast({
        title: "Upload successful",
        description: "Welder photo has been uploaded"
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