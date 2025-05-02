import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

/**
 * Special component to fix inspection order generation for Project 2025-4 (ID 6)
 */
const Project6InspectionOrderFix = () => {
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/quality/inspection-orders/special-fix-project-6", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirm: true })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate inspection orders");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: data.message || `Generated ${data.generatedCount} inspection orders`,
        variant: "default",
      });
      
      // Invalidate the inspection orders cache
      queryClient.invalidateQueries({ queryKey: ["/api/quality/inspection-orders/project/6"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  });
  
  const handleGenerateClick = () => {
    if (confirm("Are you sure you want to generate inspection orders for Project 2025-4 (ID 6) using the special fix?")) {
      generateMutation.mutate();
    }
  };
  
  return (
    <Card className="w-full max-w-3xl mx-auto my-4">
      <CardHeader>
        <CardTitle>Project 2025-4 Special Fix</CardTitle>
        <CardDescription>
          This is a special tool to fix inspection order generation for Project 2025-4 (ID 6)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            This tool will attempt to generate inspection orders for Project 2025-4 (ID 6) 
            using a different approach. Only use this if the regular generation method isn't working.
          </AlertDescription>
        </Alert>
        
        {generateMutation.isPending && (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            <span className="ml-2">Generating inspection orders...</span>
          </div>
        )}
        
        {generateMutation.isSuccess && (
          <Alert className="mb-4 bg-green-50 text-green-900 border-green-200">
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              {generateMutation.data.message || `Generated ${generateMutation.data.generatedCount} inspection orders`}
            </AlertDescription>
          </Alert>
        )}
        
        {generateMutation.isError && (
          <Alert className="mb-4 bg-red-50 text-red-900 border-red-200">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {generateMutation.error instanceof Error ? generateMutation.error.message : "An unknown error occurred"}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button 
          onClick={handleGenerateClick} 
          disabled={generateMutation.isPending}
          variant="default"
        >
          {generateMutation.isPending ? "Generating..." : "Generate Inspection Orders"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default Project6InspectionOrderFix;