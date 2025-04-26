import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, FileCheck, ClipboardCheck, CheckCircle, XCircle, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A569BD'];

export default function InspectionDashboard({ projectId }: { projectId: number | null }) {
  const [timeframe, setTimeframe] = useState<string>("month");
  
  // Fetch inspection analytics data based on project ID and timeframe
  const { 
    data: analyticsData, 
    isLoading,
    error
  } = useQuery({
    queryKey: ['/api/quality/analytics', projectId, timeframe],
    queryFn: async ({ queryKey }) => {
      const [_, project, timeframe] = queryKey;
      if (!project) throw new Error("Project ID is required");
      
      const response = await fetch(`/api/quality/analytics/${project}?timeframe=${timeframe}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch analytics data");
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  // Fallback data in case API isn't implemented yet
  const mockData = {
    summary: {
      total: 44,
      pending: 25,
      inProgress: 10,
      completed: 8,
      rejected: 1
    },
    byType: [
      { name: 'Material', count: 15 },
      { name: 'Welding', count: 12 },
      { name: 'NDT', count: 8 },
      { name: 'Visual', count: 5 },
      { name: 'Hydrotest', count: 4 }
    ],
    byStatus: [
      { name: 'Pending', value: 25, color: '#FFBB28' },
      { name: 'In Progress', value: 10, color: '#0088FE' },
      { name: 'Completed', value: 8, color: '#00C49F' },
      { name: 'Rejected', value: 1, color: '#FF8042' }
    ],
    completionTrend: [
      { name: 'Week 1', completed: 2, pending: 42 },
      { name: 'Week 2', completed: 5, pending: 39 },
      { name: 'Week 3', completed: 8, pending: 36 },
      { name: 'Week 4', completed: 8, pending: 36 }
    ],
    ncrs: {
      total: 3,
      open: 2,
      closed: 1
    },
    performanceMetrics: {
      avgCompletionTime: 3.5, // in days
      inspectionPassRate: 88, // percentage
      firstTimePassRate: 75 // percentage
    }
  };

  // Use mock data until API is implemented
  const data = analyticsData || mockData;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertCircle className="h-12 w-12 mb-2" />
        <h3 className="text-lg font-medium mb-1">Error Loading Analytics</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {(error as Error).message || "Failed to load inspection analytics data. Please try again."}
        </p>
      </div>
    );
  }

  // Calculate completion percentage
  const completionPercentage = Math.round((data.summary.completed / data.summary.total) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inspection Analytics</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="timeframe" className="sr-only">Timeframe</Label>
          <Select 
            value={timeframe} 
            onValueChange={setTimeframe}
          >
            <SelectTrigger id="timeframe" className="w-[180px]">
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="quarter">Last 90 Days</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <FileCheck className="h-5 w-5 text-muted-foreground mr-2" />
              <div className="text-2xl font-bold">{data.summary.total}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-yellow-500 mr-2" />
              <div className="text-2xl font-bold">{data.summary.pending}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              <div className="text-2xl font-bold">{data.summary.completed}</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
              <div className="text-2xl font-bold">{data.summary.rejected}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Inspection Completion Progress</CardTitle>
          <CardDescription>
            Overall inspection completion status for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{completionPercentage}% Complete</span>
              <span className="text-sm text-muted-foreground">
                {data.summary.completed} of {data.summary.total} inspections
              </span>
            </div>
            <Progress value={completionPercentage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Inspections by Type</CardTitle>
            <CardDescription>
              Distribution of inspection orders by inspection type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  width={500}
                  height={300}
                  data={data.byType}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspection Status Distribution</CardTitle>
            <CardDescription>
              Current status of all inspection orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart width={400} height={400}>
                  <Pie
                    data={data.byStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completion Trend</CardTitle>
          <CardDescription>
            Weekly trend of inspection order completion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                width={500}
                height={300}
                data={data.completionTrend}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" stackId="a" fill="#4ade80" name="Completed" />
                <Bar dataKey="pending" stackId="a" fill="#fbbf24" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>
            Key metrics for inspection process performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Average Completion Time</h3>
              <p className="text-2xl font-bold">{data.performanceMetrics.avgCompletionTime} days</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Inspection Pass Rate</h3>
              <p className="text-2xl font-bold">{data.performanceMetrics.inspectionPassRate}%</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">First-Time Pass Rate</h3>
              <p className="text-2xl font-bold">{data.performanceMetrics.firstTimePassRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NCR Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Non-Conformance Reports</CardTitle>
          <CardDescription>
            Summary of NCRs related to inspections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Total NCRs</h3>
              <p className="text-2xl font-bold">{data.ncrs.total}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Open NCRs</h3>
              <p className="text-2xl font-bold">{data.ncrs.open}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Closed NCRs</h3>
              <p className="text-2xl font-bold">{data.ncrs.closed}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}