import React from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function QualityAssurancePlanPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <Helmet>
        <title>Quality Assurance Plan | Thermopac</title>
      </Helmet>
      
      <div className="space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold">Quality Assurance Plan</h1>
          <p className="text-muted-foreground">
            Create and manage Quality Assurance Plans for your projects.
          </p>
        </div>
        
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              New Quality Assurance Plan page is ready for implementation.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}