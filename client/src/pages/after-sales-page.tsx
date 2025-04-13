import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, BarChart3, LineChart, UserCheck, Calendar, FileText, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";

export default function AfterSalesPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['/api/after-sales/dashboard'],
    enabled: activeTab === "dashboard",
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">After-Sales Service</h1>
          <div className="flex items-center gap-4">
            <Button variant="outline">Export Data</Button>
            <Button>New Service Request</Button>
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-6 gap-4 w-full md:w-fit">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="service-requests">Service Requests</TabsTrigger>
            <TabsTrigger value="followups">Customer Followups</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="contracts">Service Contracts</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4">
            {isDashboardLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Service Requests</CardTitle>
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">24</div>
                      <p className="text-xs text-muted-foreground">
                        +5.2% from last month
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Upcoming Service Activities</CardTitle>
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">12</div>
                      <p className="text-xs text-muted-foreground">
                        Next 7 days
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">8</div>
                      <p className="text-xs text-muted-foreground">
                        Total value: ₹1.2M
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Open Opportunities</CardTitle>
                      <LineChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">4</div>
                      <p className="text-xs text-muted-foreground">
                        Potential value: ₹3.8M
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                  <Card className="col-span-4">
                    <CardHeader>
                      <CardTitle>Service Request Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                      <div className="h-[300px] flex items-center justify-center">
                        <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
                        <p className="text-muted-foreground ml-4">Service request statistics by status</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="col-span-3">
                    <CardHeader>
                      <CardTitle>Top Customers</CardTitle>
                      <CardDescription>
                        Customers with most service requests
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              Flukar Automation
                            </p>
                            <p className="text-sm text-muted-foreground">
                              8 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">High Priority</div>
                        </div>
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              Afluena Oil
                            </p>
                            <p className="text-sm text-muted-foreground">
                              6 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">Medium</div>
                        </div>
                        <div className="flex items-center">
                          <UserCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                          <div className="ml-4 space-y-1">
                            <p className="text-sm font-medium leading-none">
                              BIOFACTOR SA
                            </p>
                            <p className="text-sm text-muted-foreground">
                              5 service requests
                            </p>
                          </div>
                          <div className="ml-auto font-medium">Medium</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
          
          {/* Service Requests Tab */}
          <TabsContent value="service-requests">
            <Card>
              <CardHeader>
                <CardTitle>Service Requests</CardTitle>
                <CardDescription>
                  Manage customer service requests, activities, and parts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Service requests list will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Customer Followups Tab */}
          <TabsContent value="followups">
            <Card>
              <CardHeader>
                <CardTitle>Customer Followups</CardTitle>
                <CardDescription>
                  Track and manage customer followup activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Customer followups will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Business Opportunities Tab */}
          <TabsContent value="opportunities">
            <Card>
              <CardHeader>
                <CardTitle>Business Opportunities</CardTitle>
                <CardDescription>
                  Manage potential business opportunities with customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Business opportunities will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Service Contracts Tab */}
          <TabsContent value="contracts">
            <Card>
              <CardHeader>
                <CardTitle>Service Contracts</CardTitle>
                <CardDescription>
                  Manage service contracts, services, and deliveries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Service contracts will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <CardTitle>After-Sales Reports</CardTitle>
                <CardDescription>
                  Generate and view reports on after-sales activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Reports will be displayed here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}