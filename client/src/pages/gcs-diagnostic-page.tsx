import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import GcsDebugTool from '@/components/gcs-debug-tool';
import WelderPhotoUpload from '@/components/welder-photo-upload';
import FileUploadTest from '@/components/file-upload-test';
import { Separator } from '@/components/ui/separator';
import Layout from '@/components/layout';

/**
 * GCS Diagnostic Page for testing Google Cloud Storage connectivity
 * This page should only be accessible by administrators
 */
export default function GcsDiagnosticPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user || user.role !== 'Superuser') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center">
          You do not have permission to access this page.
          Only Superusers can access GCS diagnostics.
        </p>
      </div>
    );
  }

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-2 pl-4">GCS Diagnostic Tools</h1>
        <p className="text-muted-foreground mb-6">
          These tools help diagnose issues with Google Cloud Storage connectivity
          and welder photo uploads.
        </p>

        <div className="grid gap-6">
          <GcsDebugTool />
          
          <Separator className="my-4" />
          
          <FileUploadTest />
          
          <Separator className="my-4" />
          
          <div>
            <h2 className="text-xl font-semibold mb-4">Test Photo Upload (Welder ID: 1)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-md font-medium mb-2">Using Numeric ID</h3>
                <WelderPhotoUpload 
                  welderId={1} 
                  onPhotoUploadSuccess={(path) => {
                    console.log("Photo upload success with numeric ID:", path);
                  }} 
                />
              </div>
              
              <div>
                <h3 className="text-md font-medium mb-2">Using Welder Code</h3>
                <WelderPhotoUpload 
                  welderCode="W-001" 
                  onPhotoUploadSuccess={(path) => {
                    console.log("Photo upload success with welder code:", path);
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}