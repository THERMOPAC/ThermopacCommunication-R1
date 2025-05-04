import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileCheck2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';

interface InspectionDocumentUploadProps {
  inspectionOrderNumber: string;
  tabName: string;
  recordId: string;
  onSuccess?: (data: any) => void;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const InspectionDocumentUpload: React.FC<InspectionDocumentUploadProps> = ({
  inspectionOrderNumber,
  tabName,
  recordId,
  onSuccess,
  className = '',
  variant = 'outline',
  size = 'sm'
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload',
        variant: 'destructive'
      });
      return;
    }
    
    // Check if the file is a PDF
    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid file type',
        description: 'Please select a PDF file',
        variant: 'destructive'
      });
      return;
    }
    
    // Create FormData to send the file
    const formData = new FormData();
    formData.append('file', file);
    formData.append('inspectionOrderNumber', inspectionOrderNumber);
    formData.append('tabName', tabName);
    formData.append('recordId', recordId);
    
    try {
      setIsUploading(true);
      
      const response = await fetch('/api/quality/inspection-documents/upload', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header here as it will be set automatically with the correct boundary
      }).then(res => res.json());
      
      if (response.success) {
        toast({
          title: 'Document uploaded successfully',
          description: 'The document has been uploaded',
          variant: 'default'
        });
        
        // Invalidate the query for inspection documents
        queryClient.invalidateQueries({ 
          queryKey: ['/api/quality/inspection-documents', inspectionOrderNumber, tabName, recordId]
        });
        
        // Call onSuccess if provided
        if (onSuccess) {
          onSuccess(response);
        }
      } else {
        throw new Error(response.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'An error occurred while uploading the document',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        accept="application/pdf"
        style={{ display: 'none' }}
      />
      <Button
        type="button"
        variant={variant === 'outline' ? 'default' : variant}
        size={size}
        className={`${className} shadow-sm hover:shadow-md transition-all border-2 ${isUploading ? 'opacity-80' : 'hover:border-primary'}`}
        onClick={triggerFileInput}
        disabled={isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Upload PDF
          </>
        )}
      </Button>
    </>
  );
};

export default InspectionDocumentUpload;