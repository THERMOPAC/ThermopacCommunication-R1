import React from 'react';
import { Link } from 'wouter';
import { GCSTestUploader } from '@/components/gcs-test-uploader';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

/**
 * Page for testing Google Cloud Storage functionality
 */
export default function GCSTestPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/calibration-management">
              <ChevronLeft className="h-4 w-4" />
              Back to Calibration Management
            </Link>
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">GCS Test Utilities</h1>
        <p className="text-muted-foreground">
          Tools for testing Google Cloud Storage functionality and diagnosing issues.
        </p>
      </div>
      
      <div className="border rounded-lg p-6 bg-card">
        <GCSTestUploader />
      </div>
    </div>
  );
}