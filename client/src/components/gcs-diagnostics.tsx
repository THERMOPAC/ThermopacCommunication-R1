import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * GCS Diagnostics Component
 * 
 * This component provides a diagnostic interface for troubleshooting GCS storage issues
 * by checking permissions, connectivity, and configuration details.
 */
export default function GcsDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      // Call our diagnostic endpoint
      const response = await apiRequest('GET', '/api/storage/check-permissions');
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      setDiagnosticResult(result);
      
      // Show a toast with the result summary
      if (result.success) {
        toast({
          title: "Diagnostics completed successfully",
          description: "GCS permissions check passed. All permissions are correctly configured.",
          variant: "default",
        });
      } else {
        // Determine the most specific error message based on diagnostics
        let errorMessage = "Some GCS permissions checks failed. See details for more information.";
        
        if (result.permissions) {
          if (!result.permissions.bucketExists) {
            errorMessage = `Bucket "${result.permissions.bucket}" does not exist or is not accessible.`;
          } else if (!result.permissions.canWriteFiles) {
            errorMessage = "Permission denied: Service account lacks write permissions.";
          } else if (!result.permissions.canListFiles) {
            errorMessage = "Permission denied: Service account lacks list permissions.";
          }
        }
        
        toast({
          title: "Permission issues detected",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error running diagnostics:', error);
      toast({
        title: "Diagnostics failed",
        description: error.message || "An unexpected error occurred while checking GCS permissions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine the overall status and color for display
  const getStatusIndicator = () => {
    if (!diagnosticResult) return null;
    
    if (diagnosticResult.success) {
      return <Badge variant="outline" className="bg-green-500 text-white"><CheckCircle className="w-4 h-4 mr-1" /> All checks passed</Badge>;
    }
    
    const { permissions } = diagnosticResult;
    
    // If bucket exists but we can't write, it's a permissions issue
    if (permissions.bucketExists && !permissions.canWriteFiles) {
      return <Badge variant="destructive"><XCircle className="w-4 h-4 mr-1" /> Permission denied</Badge>;
    }
    
    // If bucket doesn't exist, it's a configuration issue
    if (!permissions.bucketExists) {
      return <Badge variant="outline" className="bg-amber-500 text-white"><AlertTriangle className="w-4 h-4 mr-1" /> Bucket not found</Badge>;
    }
    
    return <Badge variant="destructive"><XCircle className="w-4 h-4 mr-1" /> Check failed</Badge>;
  };

  // Format credential info for display (don't show actual values for security)
  const formatCredentials = () => {
    if (!diagnosticResult?.permissions?.credentials) return "No credentials info available";
    
    const { credentials } = diagnosticResult.permissions;
    
    return (
      <div className="space-y-1 text-sm">
        <div>Type: {credentials.type || "Not set"}</div>
        <div>Project ID: {credentials.projectId ? "✓ Present" : "❌ Missing"}</div>
        <div>Service Account: {credentials.clientEmail ? "✓ Present" : "❌ Missing"}</div>
        <div>Private Key: {credentials.hasPrivateKey ? "✓ Present" : "❌ Missing"}</div>
      </div>
    );
  };

  // Generate suggestions based on diagnostic results
  const getSuggestions = () => {
    if (!diagnosticResult) return [];
    
    const suggestions: string[] = [];
    const { permissions, environment } = diagnosticResult;
    
    if (!permissions.bucketExists) {
      suggestions.push(`The bucket "${permissions.bucket}" does not exist or is not accessible. Please verify the bucket name in GOOGLE_CLOUD_BUCKET.`);
    }
    
    if (permissions.bucketExists && !permissions.canListFiles) {
      suggestions.push("The service account lacks permission to list files in the bucket. Grant 'Storage Object Viewer' role.");
    }
    
    if (permissions.bucketExists && !permissions.canWriteFiles) {
      suggestions.push("The service account lacks permission to write files to the bucket. Grant 'Storage Object Creator' role.");
    }
    
    if (!permissions.credentials.hasPrivateKey || !permissions.credentials.clientEmail) {
      suggestions.push("The Google Cloud credentials appear to be invalid or incomplete. Verify GOOGLE_CLOUD_CREDENTIALS is properly set.");
    }
    
    // Add a general suggestion about IAM
    if (permissions.bucketExists && (!permissions.canListFiles || !permissions.canWriteFiles)) {
      suggestions.push("Check IAM permissions in Google Cloud Console and ensure the service account has appropriate roles.");
    }
    
    return suggestions;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>GCS Storage Diagnostics</span>
          {diagnosticResult && getStatusIndicator()}
        </CardTitle>
        <CardDescription>
          Diagnose Google Cloud Storage permission issues by checking bucket access and configuration
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Running diagnostics...</span>
          </div>
        )}
        
        {!loading && diagnosticResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-medium">Bucket Status</h3>
                <div className="text-sm space-y-1">
                  <div className="flex items-center">
                    <span className="w-40">Bucket Name:</span>
                    <span>{diagnosticResult.permissions.bucket}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Bucket Exists:</span>
                    <span>{diagnosticResult.permissions.bucketExists ? 
                      <CheckCircle className="w-4 h-4 text-green-500" /> : 
                      <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Can List Files:</span>
                    <span>{diagnosticResult.permissions.canListFiles ? 
                      <CheckCircle className="w-4 h-4 text-green-500" /> : 
                      <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Can Write Files:</span>
                    <span>{diagnosticResult.permissions.canWriteFiles ? 
                      <CheckCircle className="w-4 h-4 text-green-500" /> : 
                      <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Can Delete Files:</span>
                    <span>{diagnosticResult.permissions.canDeleteFiles ? 
                      <CheckCircle className="w-4 h-4 text-green-500" /> : 
                      <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-medium">Environment</h3>
                <div className="text-sm space-y-1">
                  <div className="flex items-center">
                    <span className="w-40">Node Environment:</span>
                    <span>{diagnosticResult.environment.nodeEnv}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Bucket Env Var:</span>
                    <span>{diagnosticResult.environment.googleBucketEnvVar}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Corrected Name:</span>
                    <span>{diagnosticResult.environment.correctedBucketName}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-40">Has Credentials:</span>
                    <span>{diagnosticResult.environment.hasGoogleCredentials ? 
                      <CheckCircle className="w-4 h-4 text-green-500" /> : 
                      <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Google Cloud Credentials Section */}
            <div className="pt-2">
              <h3 className="font-medium mb-2">Google Cloud Credentials</h3>
              {formatCredentials()}
            </div>
            
            {/* Suggestions Section */}
            {getSuggestions().length > 0 && (
              <div className="pt-2 border-t">
                <h3 className="font-medium mb-2">Suggestions</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {getSuggestions().map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Technical Details Section (collapsible) */}
            <div className="pt-2 border-t">
              <Button 
                variant="ghost" 
                onClick={() => setShowDetails(!showDetails)}
                className="p-0 h-auto font-medium text-sm hover:bg-transparent hover:underline"
              >
                {showDetails ? "Hide technical details" : "Show technical details"}
              </Button>
              
              {showDetails && (
                <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-md overflow-x-auto text-xs font-mono">
                  <pre>{JSON.stringify(diagnosticResult, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
        
        {!loading && !diagnosticResult && (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Info className="h-12 w-12 text-blue-500 mb-4" />
            <p className="mb-6">
              Run the GCS diagnostics tool to check for permission issues with Google Cloud Storage
              that may be preventing file uploads in the Production environment.
            </p>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button onClick={runDiagnostics} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Run Diagnostics
        </Button>
      </CardFooter>
    </Card>
  );
}