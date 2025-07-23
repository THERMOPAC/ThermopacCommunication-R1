import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from "recharts";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  DollarSign,
  Calendar,
  Users,
  Target,
  Activity,
  Briefcase,
  Edit,
  Eye
} from "lucide-react";

interface ProjectStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  totalValue: number;
  completionRate: number;
}

interface ProjectData {
  id: number;
  name: string;
  description: string;
  clientName: string;
  status: string;
  startDate: string;
  targetEndDate: string;
  estimatedBudget: string;
  actualCost: string | null;
  progress: number;
}

interface ChartData {
  name: string;
  value: number;
  fill?: string;
}

export default function ProjectDashboardPage() {
  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectData[]>({
    queryKey: ["/api/projects"],
  });

  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery({
    queryKey: ["/api/production/work-orders"],
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/simple-finance/invoices-list"],
  });

  // Calculate project statistics
  const projectStats: ProjectStats = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p: ProjectData) => p.status === 'active').length,
    completedProjects: projects.filter((p: ProjectData) => p.status === 'completed').length,
    onHoldProjects: projects.filter((p: ProjectData) => p.status === 'on_hold').length,
    totalValue: projects.reduce((sum: number, p: ProjectData) => sum + (parseFloat(p.estimatedBudget) || 0), 0),
    completionRate: projects.length > 0 ? 
      (projects.filter((p: ProjectData) => p.status === 'completed').length / projects.length * 100) : 0
  };

  // Prepare chart data
  const statusChartData: ChartData[] = [
    { name: 'Active', value: projectStats.activeProjects, fill: '#22c55e' },
    { name: 'Completed', value: projectStats.completedProjects, fill: '#3b82f6' },
    { name: 'On Hold', value: projectStats.onHoldProjects, fill: '#f59e0b' }
  ];

  const projectProgressData = projects.map((project: ProjectData) => ({
    name: project.name.substring(0, 10) + '...',
    progress: project.progress || 0,
    budget: parseFloat(project.estimatedBudget) || 0,
    actual: parseFloat(project.actualCost || '0') || 0
  }));

  const monthlyData = [
    { month: 'Jan', projects: 12, value: 2400000 },
    { month: 'Feb', projects: 15, value: 3200000 },
    { month: 'Mar', projects: 18, value: 2800000 },
    { month: 'Apr', projects: 22, value: 4100000 },
    { month: 'May', projects: 25, value: 3800000 },
    { month: 'Jun', projects: 20, value: 3500000 }
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'on hold': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isLoading = projectsLoading || workOrdersLoading || invoicesLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg">Loading project dashboard...</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight pl-4">Project Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive overview of all projects and their status
            </p>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projectStats.totalProjects}</div>
              <p className="text-xs text-muted-foreground">
                Active portfolio
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{projectStats.activeProjects}</div>
              <p className="text-xs text-muted-foreground">
                Currently in progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(projectStats.totalValue)}</div>
              <p className="text-xs text-muted-foreground">
                Portfolio value
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projectStats.completionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Success rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Analysis */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="status">Status Analysis</TabsTrigger>
            <TabsTrigger value="progress">Progress Tracking</TabsTrigger>
            <TabsTrigger value="financial">Financial Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Project Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly Project Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [value, 'Projects']} />
                      <Area 
                        type="monotone" 
                        dataKey="projects" 
                        stroke="#3b82f6" 
                        fill="#3b82f6" 
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Status Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {projects.slice(0, 10).map((project: ProjectData) => (
                    <div key={project.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">{project.description}</p>
                        <p className="text-sm text-muted-foreground">Customer: {project.clientName}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className={getStatusColor(project.status)}>
                          {project.status}
                        </Badge>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(parseFloat(project.estimatedBudget) || 0)}</div>
                          <div className="text-sm text-muted-foreground">Budget</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="progress" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Progress Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={projectProgressData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="progress" fill="#22c55e" name="Progress %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Financial Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Value']} />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Project Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projects.slice(0, 5).map((project: ProjectData) => (
                <div key={project.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Status: {project.status} • Customer: {project.clientName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium">{formatCurrency(parseFloat(project.estimatedBudget) || 0)}</div>
                      <div className="text-xs text-muted-foreground">
                        {project.startDate && new Date(project.startDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => {
                          window.location.href = `/projects/${project.id}`;
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => {
                          // Navigate to project edit page - for now redirect to project detail page
                          window.location.href = `/projects/${project.id}`;
                        }}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}