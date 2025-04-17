import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertCircle, Info } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Type definitions for the diagnostic results
interface DiagnosticResults {
  success: boolean;
  permissions: {
    bucketExists: boolean;
    canListFiles: boolean;
    canUploadFiles: boolean;
    canDownloadFiles: boolean;
  };
  environment: {
    bucketName: string;
    projectId: string;
    serviceAccount: string;
    environment: string;
  };
  errors?: string[];
}

const GcsDiagnostics = () => {
  const [results, setResults] = useState<DiagnosticResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('GET', '/api/gcs-permissions-check');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run GCS diagnostics');
      }
      
      const diagnosticResults = await response.json();
      setResults(diagnosticResults);
      
      // Show a toast notification with the result
      if (diagnosticResults.success) {
        toast({
          title: "Storage Diagnostics Complete",
          description: "All permissions and configurations are correct.",
          variant: "default",
        });
      } else {
        toast({
          title: "Storage Issues Detected",
          description: "There are configuration issues with Google Cloud Storage.",
          variant: "destructive",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      toast({
        title: "Diagnostics Failed",
        description: err instanceof Error ? err.message : 'Failed to run storage diagnostics',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const StatusIcon = ({ status }: { status: boolean }) => {
    return status ? 
      <CheckCircle className="h-5 w-5 text-green-500" /> : 
      <XCircle className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <Button 
          onClick={runDiagnostics} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Diagnostics...
            </>
          ) : (
            'Run Storage Diagnostics'
          )}
        </Button>
      </div>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {results && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                {results.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span>Storage Configuration Healthy</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-amber-500 mr-2" />
                    <span>Storage Configuration Issues</span>
                  </>
                )}
              </CardTitle>
              <CardDescription>
                Diagnostic results for Google Cloud Storage configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Status</TableHead>
                    <TableHead>Permission Check</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell><StatusIcon status={results.permissions.bucketExists} /></TableCell>
                    <TableCell>Bucket Exists</TableCell>
                    <TableCell>
                      {results.permissions.bucketExists 
                        ? `Bucket "${results.environment.bucketName}" found` 
                        : `Bucket "${results.environment.bucketName}" not found or not accessible`}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><StatusIcon status={results.permissions.canListFiles} /></TableCell>
                    <TableCell>List Files Permission</TableCell>
                    <TableCell>
                      {results.permissions.canListFiles 
                        ? "Can list files in bucket" 
                        : "Cannot list files in bucket"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><StatusIcon status={results.permissions.canUploadFiles} /></TableCell>
                    <TableCell>Upload Files Permission</TableCell>
                    <TableCell>
                      {results.permissions.canUploadFiles 
                        ? "Can upload files to bucket" 
                        : "Cannot upload files to bucket"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><StatusIcon status={results.permissions.canDownloadFiles} /></TableCell>
                    <TableCell>Download Files Permission</TableCell>
                    <TableCell>
                      {results.permissions.canDownloadFiles 
                        ? "Can download files from bucket" 
                        : "Cannot download files from bucket"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Info className="h-5 w-5 text-blue-500 mr-2" />
                <span>Environment Configuration</span>
              </CardTitle>
              <CardDescription>
                Current storage environment settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setting</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Environment</TableCell>
                    <TableCell>{results.environment.environment}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Bucket Name</TableCell>
                    <TableCell>{results.environment.bucketName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Project ID</TableCell>
                    <TableCell>{results.environment.projectId}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Service Account</TableCell>
                    <TableCell>{results.environment.serviceAccount}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {results.errors && results.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Storage Issues Detected</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {results.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Troubleshooting Steps</CardTitle>
              <CardDescription>
                Follow these steps if you're experiencing storage issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-1">If the bucket doesn't exist:</h3>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Verify that the bucket name is spelled correctly (should be "thermopac_storage")</li>
                    <li>Ensure the bucket has been created in the Google Cloud Console</li>
                    <li>Check that the service account has access to the bucket</li>
                  </ol>
                </div>
                
                <div>
                  <h3 className="font-medium mb-1">If permission checks fail:</h3>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Verify that the service account has the "Storage Admin" role in Google Cloud IAM</li>
                    <li>Ensure the service account credentials are properly configured in environment variables</li>
                    <li>Check for any errors in the credentials JSON format</li>
                    <li>Verify that the GOOGLE_CLOUD_CREDENTIALS environment variable is correctly set</li>
                  </ol>
                </div>
                
                <div>
                  <h3 className="font-medium mb-1">Environment variables to check:</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>GOOGLE_CLOUD_BUCKET: Should be "thermopac_storage"</li>
                    <li>GOOGLE_CLOUD_PROJECT_ID: Should match the Google Cloud project ID</li>
                    <li>GOOGLE_CLOUD_CREDENTIALS: Should contain valid service account JSON credentials</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default GcsDiagnostics;