import React from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function QualityReportsPage() {
  const { user } = useAuth();

  return (
    <>
      <Helmet>
        <title>Quality Reports | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Quality Reports</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quality Reports Dashboard</CardTitle>
            <CardDescription>
              View and analyze quality metrics, reports, and compliance documentation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <h3 className="text-lg font-medium">Quality Reports Module</h3>
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