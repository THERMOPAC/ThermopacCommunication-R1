import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw, Users, Activity, TrendingUp, Shield, AlertCircle, CheckCircle, Clock, XCircle, CheckSquare, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend } from 'recharts';
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

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
  taskCompletionRate: number;
  inspectionCompletionRate: number;
  invoicePaymentRate: number;
  insights: {
    healthStatus: 'healthy' | 'warning' | 'critical';
    complianceStatus: 'good' | 'moderate' | 'poor';
    productivityStatus: 'excellent' | 'good' | 'needs_improvement';
  };
}

interface BusinessInsights {
  insights: Array<{
    category: string;
    title: string;
    description: string;
    trend: string;
    recommendation: string;
  }>;
  recommendations: Array<{
    category: string;
    title: string;
    description: string;
    impact: string;
    effort: string;
  }>;
  alerts: Array<{
    type: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    message: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  summary: {
    totalAlerts: number;
    criticalAlerts: number;
    pendingActions: number;
    improvementOpportunities: number;
  };
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

interface MeetingCommitmentAnalytics {
  summary: {
    totalMeetings: number;
    totalCommitments: number;
    completedCommitments: number;
    overdueCommitments: number;
    averageCompletionRate: number;
  };
  meetingCreators: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    totalMeetings: number;
    recentMeetings: string[];
  }>;
  commitmentCreators: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    totalCommitments: number;
    completedCommitments: number;
    overdueCommitments: number;
  }>;
  commitmentFailures: Array<{
    userId: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
    department?: string;
    totalAssigned: number;
    completedCount: number;
    overdueCount: number;
    pendingCount: number;
    completionRate: number;
    averageDaysToComplete: number;
  }>;
  overdueCommitmentsDetails: Array<{
    id: number;
    title: string;
    description?: string;
    priority: string;
    dueDate: string;
    status: string;
    assignedTo: {
      id: number;
      username: string;
      firstName?: string;
      lastName?: string;
      role: string;
    };
    assignedBy: {
      id: number;
      username: string;
      firstName?: string;
      lastName?: string;
    };
    daysPastDue: number;
  }>;
  commitmentTrends: Array<{
    month: string;
    totalCreated: number;
    completed: number;
    overdue: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function BusinessIntelligencePage() {
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Initialize heartbeat for live user tracking
  useHeartbeat({ interval: 30000 }); // Send heartbeat every 30 seconds

  // Format dates for API calls
  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined;

  // API Queries
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ['/api/business-intelligence/overview', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: activityStats, isLoading: activityLoading, refetch: refetchActivityStats } = useQuery<ActivityStats>({
    queryKey: ['/api/business-intelligence/activity-stats', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: moduleUsage, isLoading: moduleLoading, refetch: refetchModuleUsage } = useQuery<ModuleUsage>({
    queryKey: ['/api/business-intelligence/module-usage', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: productivityMetrics, isLoading: productivityLoading, refetch: refetchProductivityMetrics } = useQuery<ProductivityMetrics>({
    queryKey: ['/api/business-intelligence/productivity-metrics', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: complianceStatus, isLoading: complianceLoading, refetch: refetchComplianceStatus } = useQuery<ComplianceStatus>({
    queryKey: ['/api/business-intelligence/compliance-status'],
  });

  const { data: businessInsights, isLoading: insightsLoading, refetch: refetchBusinessInsights } = useQuery<BusinessInsights>({
    queryKey: ['/api/business-intelligence/insights', startDate, endDate],
    enabled: !!startDate && !!endDate,
  });

  const { data: activeUsersCount, isLoading: activeUsersLoading, refetch: refetchActiveUsersCount } = useQuery<{activeUsers: number, totalUsers: number}>({
    queryKey: ['/api/business-intelligence/active-users-count'],
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
    staleTime: 0, // Always consider data stale to ensure fresh counts
    cacheTime: 0, // Don't cache responses to ensure fresh data
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });

  const { data: meetingCommitmentAnalytics, isLoading: meetingCommitmentLoading, refetch: refetchMeetingCommitmentAnalytics } = useQuery<{success: boolean, data: MeetingCommitmentAnalytics}>({
    queryKey: ['/api/business-intelligence/meetings-commitments', startDate, endDate],
    enabled: !!startDate && !!endDate,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'good':
      case 'excellent':
        return <Badge variant="default" className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'warning':
      case 'moderate':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'critical':
      case 'poor':
      case 'needs_improvement':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAlertBadge = (type: string, priority: string) => {
    if (type === 'critical') {
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Critical</Badge>;
    } else if (type === 'warning') {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />Warning</Badge>;
    } else {
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Info</Badge>;
    }
  };

  const refreshAllData = () => {
    // Refresh all queries on the page
    refetchOverview();
    refetchActivityStats();
    refetchModuleUsage();
    refetchProductivityMetrics();
    refetchComplianceStatus();
    refetchBusinessInsights();
    refetchActiveUsersCount();
    refetchMeetingCommitmentAnalytics();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pl-4">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Business Intelligence</h1>
              {activeUsersLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-500">Loading...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    {activeUsersCount?.activeUsers || 0} users active
                  </span>
                </div>
              )}
            </div>
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
              <CardTitle className="text-sm font-medium">Live Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activeUsersLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{activeUsersCount?.activeUsers || 0}</div>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    of {activeUsersCount?.totalUsers || 0} total users currently online
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
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{overview?.systemHealthScore.toFixed(1) || '0.0'}%</div>
                    {overview?.insights && getStatusBadge(overview.insights.healthStatus)}
                  </div>
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
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{overview?.complianceRate.toFixed(1) || '0.0'}%</div>
                    {overview?.insights && getStatusBadge(overview.insights.complianceStatus)}
                  </div>
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
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{overview?.productivityIndex.toFixed(1) || '0.0'}%</div>
                    {overview?.insights && getStatusBadge(overview.insights.productivityStatus)}
                  </div>
                  <Progress value={overview?.productivityIndex || 0} className="mt-2" />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Tabs */}
        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="insights">Insights & Alerts</TabsTrigger>
            <TabsTrigger value="activity">User Activity</TabsTrigger>
            <TabsTrigger value="modules">Module Usage</TabsTrigger>
            <TabsTrigger value="productivity">Productivity</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="meetings">Meetings & Commitments</TabsTrigger>
          </TabsList>

          {/* Insights & Alerts Tab */}
          <TabsContent value="insights" className="space-y-6">
            {/* Alerts Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">{businessInsights?.summary.totalAlerts || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
                  <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold text-red-600">{businessInsights?.summary.criticalAlerts || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold text-yellow-600">{businessInsights?.summary.pendingActions || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Improvement Opportunities</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold text-green-600">{businessInsights?.summary.improvementOpportunities || 0}</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Alerts */}
              <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/active-alerts')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Active Alerts
                  </CardTitle>
                  <CardDescription>Issues requiring immediate attention (Click to view details)</CardDescription>
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : businessInsights?.alerts && businessInsights.alerts.length > 0 ? (
                    <div className="space-y-4">
                      {businessInsights.alerts.map((alert, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getAlertBadge(alert.type, alert.priority)}
                                <Badge variant="outline" className="text-xs">{alert.category}</Badge>
                              </div>
                              <h4 className="font-medium">{alert.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                              <p className="text-sm font-medium mt-2 text-blue-600">Action: {alert.action}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>No active alerts - system is running smoothly!</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Recommendations
                  </CardTitle>
                  <CardDescription>Actionable improvements for better performance</CardDescription>
                </CardHeader>
                <CardContent>
                  {insightsLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : businessInsights?.recommendations && businessInsights.recommendations.length > 0 ? (
                    <div className="space-y-4">
                      {businessInsights.recommendations.map((rec, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-medium">{rec.title}</h4>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">Impact: {rec.impact}</Badge>
                              <Badge variant="outline" className="text-xs">Effort: {rec.effort}</Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{rec.description}</p>
                          <Badge variant="secondary" className="mt-2 text-xs">{rec.category}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>No recommendations available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Business Insights */}
            {businessInsights?.insights && businessInsights.insights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Business Performance Insights
                  </CardTitle>
                  <CardDescription>Key insights about your business operations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {businessInsights.insights.map((insight, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium">{insight.title}</h4>
                          <Badge variant="outline" className="text-xs">{insight.category}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                        <div className="mt-2 text-sm">
                          <span className="font-medium text-blue-600">Recommendation: </span>
                          <span>{insight.recommendation}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

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

          {/* Meeting & Commitments Tab */}
          <TabsContent value="meetings" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">{meetingCommitmentAnalytics?.data?.summary?.totalMeetings || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Commitments</CardTitle>
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">{meetingCommitmentAnalytics?.data?.summary?.totalCommitments || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold text-green-600">{meetingCommitmentAnalytics?.data?.summary?.completedCommitments || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                  <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold text-red-600">{meetingCommitmentAnalytics?.data?.summary?.overdueCommitments || 0}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <>
                      <div className="text-2xl font-bold">{Number(meetingCommitmentAnalytics?.data?.summary?.averageCompletionRate || 0).toFixed(1)}%</div>
                      <Progress value={Number(meetingCommitmentAnalytics?.data?.summary?.averageCompletionRate || 0)} className="mt-2" />
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Meeting Creators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top Meeting Organizers
                  </CardTitle>
                  <CardDescription>Users creating the most meetings</CardDescription>
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : meetingCommitmentAnalytics?.data?.meetingCreators && meetingCommitmentAnalytics.data.meetingCreators.length > 0 ? (
                    <div className="space-y-4">
                      {meetingCommitmentAnalytics.data.meetingCreators.slice(0, 10).map((creator, index) => (
                        <div key={creator.userId} className="flex justify-between items-center p-4 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{creator.role}</Badge>
                              <span className="font-medium">{getDisplayName(creator)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Recent: {creator.recentMeetings?.slice(0, 2).join(', ') || 'No recent meetings'}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{creator.totalMeetings}</div>
                            <p className="text-xs text-muted-foreground">meetings</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p>No meeting data available for selected period</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Commitment Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Commitment Performance Issues
                  </CardTitle>
                  <CardDescription>Users with low completion rates</CardDescription>
                </CardHeader>
                <CardContent>
                  {meetingCommitmentLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : meetingCommitmentAnalytics?.data?.commitmentFailures && meetingCommitmentAnalytics.data.commitmentFailures.length > 0 ? (
                    <div className="space-y-4">
                      {meetingCommitmentAnalytics.data.commitmentFailures.slice(0, 10).map((user, index) => (
                        <div key={user.userId} className={`flex justify-between items-center p-4 border rounded-lg ${
                          Number(user.completionRate || 0) < 50 ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' : 
                          Number(user.completionRate || 0) < 80 ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950' : 
                          'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                        }`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{user.role}</Badge>
                              <span className="font-medium">{getDisplayName(user)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {user.department && `${user.department} • `}
                              {user.totalAssigned} assigned, {user.completedCount} completed, {user.overdueCount} overdue
                            </p>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${
                              Number(user.completionRate || 0) < 50 ? 'text-red-600' : 
                              Number(user.completionRate || 0) < 80 ? 'text-yellow-600' : 
                              'text-green-600'
                            }`}>
                              {Number(user.completionRate || 0).toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground">completion</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>All users have excellent commitment completion rates!</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Overdue Commitments Details */}
            {meetingCommitmentAnalytics?.data?.overdueCommitmentsDetails && meetingCommitmentAnalytics.data.overdueCommitmentsDetails.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Overdue Commitments Requiring Immediate Action
                  </CardTitle>
                  <CardDescription>Commitments that are past their due dates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {meetingCommitmentAnalytics.data.overdueCommitmentsDetails.slice(0, 15).map((commitment, index) => (
                      <div key={commitment.id} className="flex justify-between items-start p-4 border rounded-lg border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={commitment.priority === 'High' ? 'destructive' : commitment.priority === 'Medium' ? 'default' : 'secondary'}>
                              {commitment.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{commitment.status}</Badge>
                          </div>
                          <h4 className="font-medium mb-1">{commitment.title}</h4>
                          {commitment.description && (
                            <p className="text-sm text-muted-foreground mb-2">{commitment.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm">
                            <span>
                              <strong>Assigned to:</strong> {getDisplayName(commitment.assignedTo)} ({commitment.assignedTo?.role})
                            </span>
                            <span>
                              <strong>Assigned by:</strong> {getDisplayName(commitment.assignedBy)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-red-600 font-medium">
                            {commitment.daysPastDue} days overdue
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Due: {format(new Date(commitment.dueDate), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Commitment Trends Chart */}
            {meetingCommitmentAnalytics?.data?.commitmentTrends && meetingCommitmentAnalytics.data.commitmentTrends.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Commitment Trends Over Time
                  </CardTitle>
                  <CardDescription>Monthly commitment creation and completion patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={meetingCommitmentAnalytics.data.commitmentTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="totalCreated" fill="#3b82f6" name="Created" />
                        <Bar dataKey="completed" fill="#10b981" name="Completed" />
                        <Bar dataKey="overdue" fill="#ef4444" name="Overdue" />
                      </BarChart>
                    </ResponsiveContainer>
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