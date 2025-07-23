import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GcsDiagnostics from "@/components/gcs-diagnostics";
import { Shield, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";

export default function DiagnosticsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("storage-diagnostics");

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight pl-4">Diagnostics</h1>
          <p className="text-muted-foreground">
            Utility tools and diagnostics for system administrators
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="storage-diagnostics">Storage Diagnostics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="storage-diagnostics" className="mt-4">
            <div className="grid gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-6">Storage Diagnostics</h2>
                <p className="text-muted-foreground mb-4">
                  If you're experiencing issues with drawing uploads, use this diagnostic tool to check Google Cloud Storage permissions and settings.
                </p>
                
                {user?.role === "Superuser" ? (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>GCS Storage Diagnostics</CardTitle>
                        <CardDescription>
                          Diagnose Google Cloud Storage permission issues by checking bucket access and configuration
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <GcsDiagnostics />
                      </CardContent>
                      <CardFooter className="flex justify-end pt-0">
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/gcs-diagnostic">
                            Advanced GCS Diagnostic Tools
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-6">
                        <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">Restricted Access</h3>
                        <p className="text-sm text-muted-foreground">
                          Storage diagnostics tools are only available to Superusers.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}