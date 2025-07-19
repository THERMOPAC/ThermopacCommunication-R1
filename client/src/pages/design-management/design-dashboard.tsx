import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FolderOpen, 
  FileText, 
  CheckCircle, 
  Clock, 
  Users, 
  TrendingUp,
  ArrowRight,
  Building2,
  Calendar,
  DollarSign,
  Briefcase
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Project {
  id: number;
  projectName: string;
  projectCode: string;
  customerName: string;
  customerId: number;
  status: string;
  startDate: string;
  endDate: string;
  projectValue: string;
  currency: string;
  description: string;
}

interface DashboardStats {
  totalProjects: number;
  designProjects: number;
  activeDrawings: number;
  pendingReviews: number;
  completedTransmittals: number;
}

export default function DesignDashboard() {
  // Fetch dashboard statistics
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['/api/design/dashboard/stats'],
  });

  // Fetch projects data
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['/api/design/projects'],
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-500 text-white';
      case 'completed': return 'bg-blue-500 text-white';
      case 'on_hold': return 'bg-yellow-500 text-black';
      case 'cancelled': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Design Dashboard</h1>
          <p className="text-gray-600 mt-2">Overview of design projects and activities from Project Management</p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProjects || projects?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Available for design work
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Design Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.designProjects || 0}</div>
            <p className="text-xs text-muted-foreground">
              With design activities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drawings</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeDrawings || 0}</div>
            <p className="text-xs text-muted-foreground">
              In progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingReviews || 0}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transmittals</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedTransmittals || 0}</div>
            <p className="text-xs text-muted-foreground">
              Completed this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projects Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Available Projects</CardTitle>
              <CardDescription>
                Projects from Project Management available for design activities
              </CardDescription>
            </div>
            <Link href="/design-management/design-projects">
              <Button variant="outline">
                View All Projects
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {projectsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Loading projects...</span>
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No projects available</h3>
              <p className="text-gray-600">
                Projects will appear here once created in the Project Management module.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.slice(0, 6).map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg line-clamp-1">{project.projectName}</CardTitle>
                        <CardDescription className="text-sm font-medium text-blue-600">
                          {project.projectCode}
                        </CardDescription>
                      </div>
                      <Badge className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <Building2 className="h-4 w-4 mr-2" />
                        <span className="line-clamp-1">{project.customerName}</span>
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>
                          {new Date(project.startDate).toLocaleDateString()} - 
                          {new Date(project.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 mr-2" />
                        <span>{project.currency} {parseFloat(project.projectValue).toLocaleString()}</span>
                      </div>
                      
                      {project.description && (
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t">
                      <Button variant="outline" size="sm" className="w-full">
                        Start Design Work
                        <ArrowRight className="h-3 w-3 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Drawing review completed</p>
                  <p className="text-xs text-gray-600">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New transmittal created</p>
                  <p className="text-xs text-gray-600">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Design standard updated</p>
                  <p className="text-xs text-gray-600">Yesterday</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Team Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Drawings Completed</span>
                <span className="text-lg font-bold">24</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Reviews This Week</span>
                <span className="text-lg font-bold">12</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Average Review Time</span>
                <span className="text-lg font-bold">2.5h</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/design-management/design-drawings">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-2" />
                  Manage Drawings
                </Button>
              </Link>
              <Link href="/design-management/design-reviews">
                <Button variant="outline" className="w-full justify-start">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Review Queue
                </Button>
              </Link>
              <Link href="/design-management/design-standards">
                <Button variant="outline" className="w-full justify-start">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Design Standards
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}