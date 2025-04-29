import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, CloudUpload, Key, AlertCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

/**
 * Debug tool for GCS connectivity testing
 */
const GcsDebugTool: React.FC = () => {
  const [isTestingGcs, setIsTestingGcs] = useState(false);
  const [isCheckingCreds, setIsCheckingCreds] = useState(false);
  const [gcsStatus, setGcsStatus] = useState<any>(null);
  const [credsStatus, setCredsStatus] = useState<any>(null);
  
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
        setGcsStatus({ success: false, error: errorText, status: response.status });
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
      setGcsStatus({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsTestingGcs(false);
    }
  };

  // Function to check GCS credentials
  const checkGcsCredentials = async () => {
    setIsCheckingCreds(true);
    try {
      console.log("Checking GCS credentials...");
      const response = await fetch('/api/test/gcs-credentials', {
        credentials: 'include' // Important for authenticated requests
      });
      
      console.log("GCS credentials check response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("GCS credentials check error:", errorText);
        toast({
          title: "GCS Credentials Check Failed",
          description: `Status: ${response.status} - ${errorText}`,
          variant: "destructive"
        });
        setCredsStatus({ success: false, error: errorText, status: response.status });
        return;
      }
      
      const data = await response.json();
      console.log("GCS credentials check result:", data);
      setCredsStatus(data);
      
      toast({
        title: data.success ? "GCS Credentials Valid" : "GCS Credentials Invalid",
        description: data.success 
          ? `Project: ${data.redactedInfo.project_id}` 
          : `Error: ${data.error}`,
        variant: data.success ? "default" : "destructive"
      });
    } catch (error) {
      console.error("Error checking GCS credentials:", error);
      toast({
        title: "GCS Credentials Check Error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
      setCredsStatus({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setIsCheckingCreds(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">GCS Diagnostics Tool</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Button
              type="button"
              onClick={checkGcsCredentials}
              disabled={isCheckingCreds}
              variant="outline"
              className="flex-1"
            >
              {isCheckingCreds ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking Credentials...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Check GCS Credentials
                </>
              )}
            </Button>
            
            <Button
              type="button"
              onClick={testGcsConnectivity}
              disabled={isTestingGcs}
              variant="outline"
              className="flex-1"
            >
              {isTestingGcs ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <CloudUpload className="mr-2 h-4 w-4" />
                  Test GCS Connection
                </>
              )}
            </Button>
          </div>
          
          {credsStatus && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center">
                  <Key className="h-4 w-4 mr-2" />
                  GCS Credentials Status
                  <Badge variant={credsStatus.success ? "default" : "destructive"} className="ml-2">
                    {credsStatus.success ? "Valid" : "Invalid"}
                  </Badge>
                </h3>
                
                {credsStatus.success ? (
                  <div className="text-xs space-y-1 border rounded p-2">
                    <div><strong>Project:</strong> {credsStatus.redactedInfo.project_id}</div>
                    <div><strong>Service Account:</strong> {credsStatus.redactedInfo.client_email}</div>
                    <div><strong>Account Type:</strong> {credsStatus.redactedInfo.type}</div>
                    <div><strong>Key ID:</strong> {credsStatus.redactedInfo.private_key_id}</div>
                    <div className="flex space-x-1">
                      <strong>Required Fields:</strong>
                      <span className={credsStatus.hasRequiredFields.type ? "text-green-600" : "text-red-600"}>Type</span>
                      <span>·</span>
                      <span className={credsStatus.hasRequiredFields.project_id ? "text-green-600" : "text-red-600"}>Project ID</span>
                      <span>·</span>
                      <span className={credsStatus.hasRequiredFields.client_email ? "text-green-600" : "text-red-600"}>Client Email</span>
                      <span>·</span>
                      <span className={credsStatus.hasRequiredFields.private_key ? "text-green-600" : "text-red-600"}>Private Key</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs border rounded p-2 text-red-500">
                    <div><strong>Error:</strong> {credsStatus.error}</div>
                    {credsStatus.firstChars && <div><strong>First chars:</strong> {credsStatus.firstChars}</div>}
                    {credsStatus.credentialsLength && <div><strong>Length:</strong> {credsStatus.credentialsLength} characters</div>}
                  </div>
                )}
              </div>
            </>
          )}
          
          {gcsStatus && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center">
                  <CloudUpload className="h-4 w-4 mr-2" />
                  GCS Connectivity Status
                  <Badge variant={gcsStatus.success ? "default" : "destructive"} className="ml-2">
                    {gcsStatus.success ? "Connected" : "Failed"}
                  </Badge>
                </h3>
                
                {gcsStatus.success ? (
                  <div className="text-xs space-y-1 border rounded p-2">
                    <div><strong>Bucket:</strong> {gcsStatus.bucketName}</div>
                    <div className="flex space-x-2">
                      <strong>Permissions:</strong>
                      <span className={gcsStatus.permissions?.read ? "text-green-600" : "text-red-600"}>
                        Read: {gcsStatus.permissions?.read ? "Yes" : "No"}
                      </span>
                      <span className={gcsStatus.permissions?.write ? "text-green-600" : "text-red-600"}>
                        Write: {gcsStatus.permissions?.write ? "Yes" : "No"}
                      </span>
                      <span className={gcsStatus.permissions?.list ? "text-green-600" : "text-red-600"}>
                        List: {gcsStatus.permissions?.list ? "Yes" : "No"}
                      </span>
                    </div>
                    {gcsStatus.numFiles > 0 && (
                      <div>
                        <strong>Files:</strong> {gcsStatus.numFiles} total
                        {gcsStatus.sampleFiles?.length > 0 && (
                          <div className="mt-1 italic">
                            Sample: {gcsStatus.sampleFiles.join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs border rounded p-2 text-red-500">
                    <div><strong>Error:</strong> {gcsStatus.error || "Connection failed"}</div>
                    {gcsStatus.details && <div><strong>Details:</strong> {gcsStatus.details}</div>}
                    {gcsStatus.status && <div><strong>Status Code:</strong> {gcsStatus.status}</div>}
                  </div>
                )}
              </div>
            </>
          )}
          
          {!credsStatus && !gcsStatus && (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mb-2" />
              <p>No diagnostic information available yet.</p>
              <p className="text-xs">Click the buttons above to test GCS connectivity.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default GcsDebugTool;