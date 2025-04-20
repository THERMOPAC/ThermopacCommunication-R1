import React from "react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "wouter";

export default function QualityAssurancePlanPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <Helmet>
        <title>Quality Assurance Plan | Thermopac</title>
      </Helmet>
      
      <div className="space-y-8 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Quality Assurance Plan</h1>
            <p className="text-muted-foreground">
              Create and manage Quality Assurance Plans for your projects.
            </p>
          </div>
          <Link href="/quality-assurance-plan/create">
            <Button className="flex items-center gap-2">
              <Plus size={16} />
              Create QAP
            </Button>
          </Link>
        </div>
        
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              No Quality Assurance Plans found. Click on "Create QAP" to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}