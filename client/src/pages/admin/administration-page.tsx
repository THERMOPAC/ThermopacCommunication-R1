import { useState } from 'react';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Users, CreditCard, Settings, BarChart3, UserPlus, Wallet, Clock, Plane } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdministrationPage() {
  const [selectedTab, setSelectedTab] = useState("overview");

  const moduleCards = [
    {
      title: "User Management",
      description: "Manage employees, roles, and access permissions",
      icon: Users,
      link: "/admin/users",
      stats: { total: "45", active: "42", inactive: "3" }
    },
    {
      title: "Attendance Management",
      description: "Monitor and manage employee attendance records",
      icon: Clock,
      link: "/admin/attendance",
      stats: { present: "38", absent: "7", late: "3" }
    },
    {
      title: "Payroll Management", 
      description: "Configure salaries, run payroll, and generate payslips",
      icon: CreditCard,
      link: "/admin/payroll",
      stats: { setup: "35", pending: "12", processed: "23" }
    },
    {
      title: "Business Trip Management",
      description: "Manage employee travel requests, bookings, and expenses",
      icon: Plane,
      link: "/admin/business-trips",
      stats: { active: "5", pending: "3", completed: "12" }
    },
    {
      title: "System Settings",
      description: "Configure system-wide settings and preferences",
      icon: Settings,
      link: "/admin/settings",
      stats: { modules: "9", active: "8", pending: "1" }
    },
    {
      title: "Reports & Analytics",
      description: "View administrative reports and system analytics", 
      icon: BarChart3,
      link: "/admin/reports",
      stats: { reports: "15", automated: "8", custom: "7" }
    }
  ];

  const quickActions = [
    {
      title: "Add New Employee",
      description: "Create a new user account with role assignment",
      icon: UserPlus,
      action: "add-user",
      link: "/admin/users/add"
    },
    {
      title: "Run Monthly Payroll",
      description: "Process salaries for the current month",
      icon: Wallet,
      action: "run-payroll", 
      link: "/admin/payroll/run-payroll"
    }
  ];

  return (
    <Layout>
      <Helmet>
        <title>Administration - THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight pl-4">Administration</h1>
            <p className="text-muted-foreground">
              Manage users, payroll, and system configurations
            </p>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="quick-actions">Quick Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">45</div>
                  <p className="text-xs text-muted-foreground">
                    42 active, 3 inactive
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Salary Configurations</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">35</div>
                  <p className="text-xs text-muted-foreground">
                    12 pending setup
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Modules</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">
                    out of 9 total modules
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Health</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Healthy</div>
                  <p className="text-xs text-muted-foreground">
                    All services running
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Administrative Activity</CardTitle>
                <CardDescription>Latest user and system changes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm">New user "John Doe" added to Engineering department</span>
                    </div>
                    <span className="text-xs text-muted-foreground">2 hours ago</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm">Payroll processed for June 2025</span>
                    </div>
                    <span className="text-xs text-muted-foreground">1 day ago</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-sm">Salary configuration updated for 5 employees</span>
                    </div>
                    <span className="text-xs text-muted-foreground">3 days ago</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules" className="space-y-4">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Available administration modules ({moduleCards.length} total):
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {moduleCards.map((module) => {
                const IconComponent = module.icon;
                return (
                  <Card key={module.title} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <IconComponent className="h-8 w-8 text-primary" />
                        <div>
                          <CardTitle>{module.title}</CardTitle>
                          <CardDescription>{module.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          {Object.entries(module.stats).map(([key, value]) => (
                            <div key={key} className="text-center">
                              <div className="font-semibold">{value}</div>
                              <div className="text-muted-foreground capitalize">{key}</div>
                            </div>
                          ))}
                        </div>
                        <Link href={module.link}>
                          <Button>Open</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="quick-actions" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {quickActions.map((action) => {
                const IconComponent = action.icon;
                return (
                  <Card key={action.title} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <IconComponent className="h-8 w-8 text-primary" />
                        <div>
                          <CardTitle>{action.title}</CardTitle>
                          <CardDescription>{action.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Link href={action.link}>
                        <Button className="w-full">Execute Action</Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}