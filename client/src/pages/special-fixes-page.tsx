import React from "react";
import { useTitle } from "react-use";
import Project3InspectionOrderFix from "@/components/special-fixes/Project3InspectionOrderFix";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SpecialFixesPage = () => {
  useTitle("Special Fixes | Thermopac");

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Special Fixes</h1>
          <p className="text-muted-foreground">
            This page contains special tools to fix specific issues in the system.
          </p>
        </div>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>System Administrator Tools</CardTitle>
            <CardDescription>
              These tools should only be used by system administrators to fix specific issues.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              <p>⚠️ Warning: These tools make direct changes to the database. Use with caution.</p>
            </div>
          </CardContent>
        </Card>
        
        <Project3InspectionOrderFix />
      </div>
    </div>
  );
};

export default SpecialFixesPage;