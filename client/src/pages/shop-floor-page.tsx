import React from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";

export default function ShopFloorPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <Helmet>
        <title>Shop Floor | Thermopac</title>
      </Helmet>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Shop Floor Management</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shop Floor Dashboard</CardTitle>
            <CardDescription>
              Manage work orders, track production progress, and monitor performance metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <h3 className="text-lg font-medium">Shop Floor Module</h3>
                <p className="text-muted-foreground mt-2">
                  This feature is currently under development. Check back soon!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}