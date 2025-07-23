import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, DateRange } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw, Users, Activity, TrendingUp, Shield, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface OverviewData {
  totalActiveUsers: number;
  totalUsers: number;
  systemHealthScore: number;
  complianceRate: number;
  productivityIndex: number;
  totalInspections: number;
  completedInspections: number;
  totalInvoices: number;
  paidInvoices: number;
}

interface ActivityStats {
  activityByTime: Array<{
    date: string;
    totalActions: number;
    uniqueUsers: number;
  }>;
  mostActiveUsers: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    totalActions: number;
    averageSessionDuration: number;
  }>;
  peakHours: Array<{
    hour: number;
    activityCount: number;
  }>;
}

interface ModuleUsage {
  moduleUsage: Array<{
    module: string;
    totalActions: number;
    uniqueUsers: number;
    averageSessionDuration: number;
  }>;
  moduleAdoption: Array<{
    date: string;
    module: string;
    uniqueUsers: number;
  }>;
}

interface ProductivityMetrics {
  userProductivity: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    department?: string;
    totalTasks: number;
    totalInspections: number;
    totalDocuments: number;
    averageAttendance: number;
    averageEfficiency: number;
  }>;
  productivityTrends: Array<{
    date: string;
    averageEfficiency: number;
    totalTasks: number;
    totalInspections: number;
  }>;
}

interface ComplianceStatus {
  complianceOverview: Array<{
    complianceType: string;
    status: string;
    count: number;
  }>;
  nonCompliantUsers: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    department?: string;
    complianceType: string;
    status: string;
    dueDate?: string;
    score?: number;
  }>;
  upcomingDeadlines: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    complianceType: string;
    dueDate: string;
    status: string;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function BusinessIntelligencePage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Format dates for API calls
  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;

  // API Queries
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ['/api/business-intelligence/overview', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: activityStats, isLoading: activityLoading } = useQuery<ActivityStats>({
    queryKey: ['/api/business-intelligence/activity-stats', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: moduleUsage, isLoading: moduleLoading } = useQuery<ModuleUsage>({
    queryKey: ['/api/business-intelligence/module-usage', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: productivityMetrics, isLoading: productivityLoading } = useQuery<ProductivityMetrics>({
    queryKey: ['/api/business-intelligence/productivity-metrics', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: complianceStatus, isLoading: complianceLoading } = useQuery<ComplianceStatus>({
    queryKey: ['/api/business-intelligence/compliance-status'],
  });

  const getDisplayName = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username;
  };

  const getComplianceStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Compliant</Badge>;
      case 'non_compliant':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Non-Compliant</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'expired':
        return <Badge variant="outline" className="border-orange-500 text-orange-600"><AlertCircle className="w-3 h-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const refreshAllData = () => {
    refetchOverview();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pl-4">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Business Intelligence</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Comprehensive analytics and insights for system performance and user productivity
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {/* Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[280px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            <Button onClick={refreshAllData} disabled={overviewLoading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", overviewLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{overview?.totalActiveUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    of {overview?.totalUsers || 0} total users
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{overview?.systemHealthScore.toFixed(1) || '0.0'}%</div>
                  <Progress value={overview?.systemHealthScore || 0} className="mt-2" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{overview?.complianceRate.toFixed(1) || '0.0'}%</div>
                  <Progress value={overview?.complianceRate || 0} className="mt-2" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productivity Index</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{overview?.productivityIndex.toFixed(1) || '0.0'}%</div>
                  <Progress value={overview?.productivityIndex || 0} className="mt-2" />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="activity" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="activity">User Activity</TabsTrigger>
            <TabsTrigger value="modules">Module Usage</TabsTrigger>
            <TabsTrigger value="productivity">Productivity</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          {/* User Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Over Time</CardTitle>
                  <CardDescription>Daily user actions and active users</CardDescription>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={activityStats?.activityByTime || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Area yAxisId="left" type="monotone" dataKey="totalActions" stackId="1" stroke="#8884d8" fill="#8884d8" />
                        <Area yAxisId="right" type="monotone" dataKey="uniqueUsers" stackId="2" stroke="#82ca9d" fill="#82ca9d" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Peak Activity Hours</CardTitle>
                  <CardDescription>System usage by hour of day</CardDescription>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={activityStats?.peakHours || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="activityCount" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Most Active Users</CardTitle>
                <CardDescription>Top 10 users by activity in selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityStats?.mostActiveUsers.map((user, index) => (
                      <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <Badge variant="outline">#{index + 1}</Badge>
                          <div>
                            <p className="font-medium">{getDisplayName(user)}</p>
                            <p className="text-sm text-muted-foreground">{user.role}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{user.totalActions}</p>
                          <p className="text-sm text-muted-foreground">actions</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Module Usage Tab */}
          <TabsContent value="modules" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Module Usage Distribution</CardTitle>
                  <CardDescription>Actions by module</CardDescription>
                </CardHeader>
                <CardContent>
                  {moduleLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={moduleUsage?.moduleUsage || []}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="totalActions"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {(moduleUsage?.moduleUsage || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Module Performance</CardTitle>
                  <CardDescription>Usage statistics by module</CardDescription>
                </CardHeader>
                <CardContent>
                  {moduleLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {moduleUsage?.moduleUsage.map((module, index) => (
                        <div key={module.module} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium">{module.module}</h4>
                            <Badge variant="outline">{module.totalActions} actions</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span>Users: {module.uniqueUsers}</span>
                            </div>
                            <div>
                              <span>Avg Session: {module.averageSessionDuration.toFixed(1)}m</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Productivity Tab */}
          <TabsContent value="productivity" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Productivity Trends</CardTitle>
                  <CardDescription>Efficiency and task completion over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {productivityLoading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={productivityMetrics?.productivityTrends || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Line yAxisId="left" type="monotone" dataKey="averageEfficiency" stroke="#8884d8" />
                        <Line yAxisId="right" type="monotone" dataKey="totalTasks" stroke="#82ca9d" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performers</CardTitle>
                  <CardDescription>Users with highest efficiency scores</CardDescription>
                </CardHeader>
                <CardContent>
                  {productivityLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {productivityMetrics?.userProductivity.slice(0, 10).map((user, index) => (
                        <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-4">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <div>
                              <p className="font-medium">{getDisplayName(user)}</p>
                              <p className="text-sm text-muted-foreground">{user.role} • {user.department}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{user.averageEfficiency.toFixed(1)}%</p>
                            <p className="text-sm text-muted-foreground">efficiency</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Compliance Overview</CardTitle>
                  <CardDescription>Status distribution across compliance types</CardDescription>
                </CardHeader>
                <CardContent>
                  {complianceLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {complianceStatus?.complianceOverview.map((item, index) => (
                        <div key={`${item.complianceType}-${item.status}`} className="flex justify-between items-center p-4 border rounded-lg">
                          <div>
                            <p className="font-medium">{item.complianceType}</p>
                            {getComplianceStatusBadge(item.status)}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{item.count}</p>
                            <p className="text-sm text-muted-foreground">users</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Deadlines</CardTitle>
                  <CardDescription>Compliance deadlines in next 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {complianceLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {complianceStatus?.upcomingDeadlines.map((deadline, index) => (
                        <div key={`${deadline.userId}-${deadline.complianceType}`} className="flex justify-between items-center p-4 border rounded-lg">
                          <div>
                            <p className="font-medium">{getDisplayName(deadline)}</p>
                            <p className="text-sm text-muted-foreground">{deadline.complianceType}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{format(new Date(deadline.dueDate), 'MMM dd, yyyy')}</p>
                            {getComplianceStatusBadge(deadline.status)}
                          </div>
                        </div>
                      ))}
                      {(!complianceStatus?.upcomingDeadlines || complianceStatus.upcomingDeadlines.length === 0) && (
                        <p className="text-center text-muted-foreground py-8">No upcoming compliance deadlines</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {complianceStatus?.nonCompliantUsers && complianceStatus.nonCompliantUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Non-Compliant Users</CardTitle>
                  <CardDescription>Users requiring immediate attention</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {complianceStatus.nonCompliantUsers.map((user, index) => (
                      <div key={`${user.userId}-${user.complianceType}`} className="flex justify-between items-center p-4 border rounded-lg border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                        <div>
                          <p className="font-medium">{getDisplayName(user)}</p>
                          <p className="text-sm text-muted-foreground">{user.role} • {user.complianceType}</p>
                        </div>
                        <div className="text-right">
                          {user.dueDate && (
                            <p className="text-sm text-red-600 dark:text-red-400">
                              Due: {format(new Date(user.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          {getComplianceStatusBadge(user.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}