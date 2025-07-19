import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart 
} from 'recharts';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Download,
  Filter,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { toast } from "@/hooks/use-toast";

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#f97316'];

interface DesignProject {
  id: number;
  designProjectName: string;
  projectName: string;
  projectCode: string;
  status: string;
}

interface DrawingStats {
  status: string;
  count: number;
  percentage: number;
}

interface TransmittalStats {
  status: string;
  count: number;
  totalDrawings: number;
}

interface ReviewStats {
  reviewType: string;
  status: string;
  count: number;
  averageDays: number;
}

interface StandardsStats {
  category: string;
  approvalStatus: string;
  count: number;
}

export default function ReportsAnalyticsPage() {
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('month');
  const [reportType, setReportType] = useState<string>('overview');

  // Fetch design projects
  const { data: designProjects = [] } = useQuery<DesignProject[]>({
    queryKey: ['/api/design/projects'],
    queryFn: async () => {
      const response = await fetch('/api/design/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    }
  });

  // Fetch drawing statistics
  const { data: drawingStats = [] } = useQuery<DrawingStats[]>({
    queryKey: ['/api/design/drawings/stats', selectedProject, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProject !== 'all') params.set('projectId', selectedProject);
      if (dateRange) params.set('dateRange', dateRange);
      
      const response = await fetch(`/api/design/drawings/stats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch drawing stats');
      return response.json();
    }
  });

  // Fetch transmittal statistics
  const { data: transmittalStats = [] } = useQuery<TransmittalStats[]>({
    queryKey: ['/api/design/transmittals/stats', selectedProject, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProject !== 'all') params.set('projectId', selectedProject);
      if (dateRange) params.set('dateRange', dateRange);
      
      const response = await fetch(`/api/design/transmittals/stats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch transmittal stats');
      return response.json();
    }
  });

  // Fetch review statistics
  const { data: reviewStats = [] } = useQuery<ReviewStats[]>({
    queryKey: ['/api/design/reviews/stats', selectedProject, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProject !== 'all') params.set('projectId', selectedProject);
      if (dateRange) params.set('dateRange', dateRange);
      
      const response = await fetch(`/api/design/reviews/stats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch review stats');
      return response.json();
    }
  });

  // Fetch standards statistics
  const { data: standardsStats = [] } = useQuery<StandardsStats[]>({
    queryKey: ['/api/design/standards/stats', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange) params.set('dateRange', dateRange);
      
      const response = await fetch(`/api/design/standards/stats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch standards stats');
      return response.json();
    }
  });

  const handleExportReport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProject !== 'all') params.set('projectId', selectedProject);
      if (dateRange) params.set('dateRange', dateRange);
      params.set('reportType', reportType);
      
      const response = await fetch(`/api/design/reports/export?${params}`);
      if (!response.ok) throw new Error('Failed to export report');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `design_report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "Success", description: "Report exported successfully" });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: "Error", description: "Failed to export report", variant: "destructive" });
    }
  };

  const totalDrawings = drawingStats.reduce((sum, stat) => sum + stat.count, 0);
  const totalTransmittals = transmittalStats.reduce((sum, stat) => sum + stat.count, 0);
  const totalDrawingsTransmitted = transmittalStats.reduce((sum, stat) => sum + stat.totalDrawings, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Design Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive insights into design management performance
          </p>
        </div>
        <Button onClick={handleExportReport} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Project</label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {designProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.designProjectName} ({project.projectCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="quarter">Last 90 Days</SelectItem>
                  <SelectItem value="year">Last 365 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="trends">Trends</SelectItem>
                  <SelectItem value="comparison">Comparison</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full">
                <Calendar className="h-4 w-4 mr-2" />
                Custom Range
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Drawings</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDrawings}</div>
            <p className="text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transmittals</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransmittals}</div>
            <p className="text-xs text-muted-foreground">
              {totalDrawingsTransmitted} drawings transmitted
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Reviews</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reviewStats.filter(r => r.status === 'In Progress').reduce((sum, r) => sum + r.count, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently in review
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {drawingStats.length > 0 ? Math.round(
                (drawingStats.find(s => s.status === 'Approved')?.count || 0) / totalDrawings * 100
              ) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Overall approval rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drawing Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Drawing Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={drawingStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({status, percentage}) => `${status} (${percentage}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {drawingStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Transmittal Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Transmittal Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={transmittalStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Review Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Review Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reviewStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="reviewType" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="averageDays" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Standards Approval */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Standards by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={standardsStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity Summary</CardTitle>
          <CardDescription>Latest design management activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {drawingStats.map((stat, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full bg-${
                    stat.status === 'Approved' ? 'green' : 
                    stat.status === 'In Review' ? 'yellow' : 
                    stat.status === 'Draft' ? 'gray' : 'red'
                  }-500`} />
                  <div>
                    <div className="font-medium">{stat.status} Drawings</div>
                    <div className="text-sm text-muted-foreground">
                      {stat.count} drawings ({stat.percentage}% of total)
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">{stat.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}