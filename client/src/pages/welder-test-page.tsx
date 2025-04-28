import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import Layout from "@/components/layout";

export default function WelderTestPage() {
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTestRequest = async () => {
    setIsLoading(true);
    setError(null);
    setResponse(null);
    
    try {
      console.log("Sending test data to server");
      
      // Test request with minimal data
      const requestData = {
        name: "Test Welder",
        trade: "Test Trade",
        processQualified: ["GTAW"],
        materialGroupQualified: ["P1"],
        thicknessRange: "1-10",
        positionQualified: ["1G"],
        wpsNumber: "WPS-1",
        testDate: "2025-04-25",
        testResults: "Pass",
        certificateExpiryDate: "2026-04-25",
        status: "Active",
        remarks: "Test remarks"
      };
      
      // Direct fetch with manual handling
      const response = await fetch("/api/quality/test-welder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(requestData),
        credentials: "include",
      });
      
      console.log("Server response status:", response.status);
      
      // Get the response text
      const responseText = await response.text();
      console.log("Response text:", responseText);
      
      // Try to parse as JSON
      try {
        const jsonData = JSON.parse(responseText);
        console.log("Parsed JSON:", jsonData);
        setResponse(jsonData);
        
        toast({
          title: "Test successful",
          description: "The test endpoint responded correctly with JSON",
        });
      } catch (jsonError) {
        console.error("Failed to parse response as JSON:", jsonError);
        
        // If response contains HTML (likely an error page)
        if (responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
          setError("Server returned HTML instead of JSON. See console for details.");
          toast({
            title: "Error parsing response",
            description: "Server returned HTML instead of JSON. This indicates a server error.",
            variant: "destructive",
          });
        } else {
          setError(`Invalid server response: ${responseText.substring(0, 100)}...`);
          toast({
            title: "Error parsing response",
            description: "Server returned invalid data. Check console for details.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Network error:", error);
      setError(error instanceof Error ? error.message : String(error));
      
      toast({
        title: "Network error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Welder Test Page</h1>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>API Test</CardTitle>
            <CardDescription>
              Test the API endpoint to diagnose issues with the welder creation form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runTestRequest} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Testing..." : "Send Test Request"}
            </Button>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <h3 className="text-lg font-medium text-red-800">Error</h3>
                <p className="text-red-600 whitespace-pre-wrap">{error}</p>
              </div>
            )}
            
            {response && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Response</h3>
                <div className="bg-gray-50 p-4 rounded-md">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(response, null, 2)}</pre>
                </div>
                
                <div className="mt-4">
                  <Badge className="bg-green-500 mr-2">Status: Success</Badge>
                  {response.success && <Badge className="bg-blue-500">Test Passed</Badge>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}