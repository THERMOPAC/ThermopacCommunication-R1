import React from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function ProductionPlanningPage() {
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>Production Planning | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Production Planning</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Production Planning Dashboard</CardTitle>
            <CardDescription>
              Manage and oversee production schedules, resources, and timelines.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <h3 className="text-lg font-medium">Production Planning Module</h3>
                <p className="text-muted-foreground mt-2">
                  This feature is currently under development. Check back soon!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}