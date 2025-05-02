import React from "react";
import { useTitle } from "react-use";
import Project3InspectionOrderFix from "@/components/special-fixes/Project3InspectionOrderFix";
import Project4InspectionOrderFix from "@/components/special-fixes/Project4InspectionOrderFix";
import Project5InspectionOrderFix from "@/components/special-fixes/Project5InspectionOrderFix";
import Project6InspectionOrderFix from "@/components/special-fixes/Project6InspectionOrderFix";
import Project7InspectionOrderFix from "@/components/special-fixes/Project7InspectionOrderFix";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        
        <Tabs defaultValue="project-2025-1" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="project-2025-1">Project 2025-1</TabsTrigger>
            <TabsTrigger value="project-2025-2">Project 2025-2</TabsTrigger>
            <TabsTrigger value="project-2025-3">Project 2025-3</TabsTrigger>
            <TabsTrigger value="project-2025-4">Project 2025-4</TabsTrigger>
            <TabsTrigger value="project-2025-5">Project 2025-5</TabsTrigger>
          </TabsList>
          
          <TabsContent value="project-2025-1">
            <Project3InspectionOrderFix />
          </TabsContent>
          
          <TabsContent value="project-2025-2">
            <Project4InspectionOrderFix />
          </TabsContent>
          
          <TabsContent value="project-2025-3">
            <Project5InspectionOrderFix />
          </TabsContent>
          
          <TabsContent value="project-2025-4">
            <Project6InspectionOrderFix />
          </TabsContent>
          
          <TabsContent value="project-2025-5">
            <Project7InspectionOrderFix />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SpecialFixesPage;