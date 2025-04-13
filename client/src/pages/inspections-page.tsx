import React from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function InspectionsPage() {
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>Inspections | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Quality Inspections</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inspections Dashboard</CardTitle>
            <CardDescription>
              Manage quality inspections, standards compliance, and quality control procedures.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <h3 className="text-lg font-medium">Inspections Module</h3>
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