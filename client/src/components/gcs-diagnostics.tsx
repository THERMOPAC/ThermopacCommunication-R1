import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";

export default function GcsDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<null | {
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
  }>(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("GET", "/api/gcs-permissions-check");
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Error running GCS diagnostics:", error);
      setResults({
        success: false,
        permissions: {
          bucketExists: false,
          canListFiles: false,
          canUploadFiles: false,
          canDownloadFiles: false
        },
        environment: {
          bucketName: "unknown",
          projectId: "unknown",
          serviceAccount: "unknown",
          environment: "unknown"
        },
        errors: ["Failed to connect to the server. Please try again."]
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <Button 
          onClick={runDiagnostics} 
          disabled={loading} 
          className="w-full"
        >
          {loading ? "Running Diagnostics..." : "Run GCS Storage Diagnostics"}
        </Button>

        {results && (
          <div className="space-y-6 mt-4">
            <Alert variant={results.success ? "default" : "destructive"}>
              <div className="flex items-center gap-2">
                {results.success ? 
                  <CheckCircle2 className="h-5 w-5" /> : 
                  <AlertCircle className="h-5 w-5" />
                }
                <AlertTitle>
                  {results.success 
                    ? "Storage is configured correctly" 
                    : "Storage configuration issues detected"
                  }
                </AlertTitle>
              </div>
              <AlertDescription>
                {results.success 
                  ? "Your Google Cloud Storage connection is working properly." 
                  : "There are issues with your Google Cloud Storage connection. Check the details below."
                }
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Storage Environment</CardTitle>
                <CardDescription>
                  Current configuration for Google Cloud Storage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Environment:</span>
                    <span>{results.environment.environment}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Bucket Name:</span>
                    <span>{results.environment.bucketName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Project ID:</span>
                    <span>{results.environment.projectId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Service Account:</span>
                    <span className="text-xs">{results.environment.serviceAccount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Permission Status</CardTitle>
                <CardDescription>
                  Current permission status for GCS operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>Bucket Exists</div>
                    <div>
                      {results.permissions.bucketExists ? 
                        <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                        <XCircle className="h-5 w-5 text-red-500" />
                      }
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>Can List Files</div>
                    <div>
                      {results.permissions.canListFiles ? 
                        <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                        <XCircle className="h-5 w-5 text-red-500" />
                      }
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>Can Upload Files</div>
                    <div>
                      {results.permissions.canUploadFiles ? 
                        <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                        <XCircle className="h-5 w-5 text-red-500" />
                      }
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>Can Download Files</div>
                    <div>
                      {results.permissions.canDownloadFiles ? 
                        <CheckCircle2 className="h-5 w-5 text-green-500" /> : 
                        <XCircle className="h-5 w-5 text-red-500" />
                      }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!results.success && results.errors && results.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Errors</CardTitle>
                  <CardDescription>
                    Found {results.errors.length} issues with your storage configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 space-y-2">
                    {results.errors.map((error, index) => (
                      <li key={index} className="text-sm">{error}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex flex-col items-start">
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-2">Common solutions:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Verify that the service account has Storage Object Admin permissions</li>
                      <li>Check that the bucket name is correctly spelled (thermopac_storage)</li>
                      <li>Ensure that the GOOGLE_CLOUD_CREDENTIALS environment variable contains valid service account credentials</li>
                      <li>Verify that the GOOGLE_CLOUD_PROJECT_ID matches your Google Cloud project</li>
                    </ul>
                  </div>
                </CardFooter>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}