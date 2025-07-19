import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  FolderKanban, 
  Building2, 
  Calendar, 
  DollarSign, 
  Search,
  ArrowRight,
  FolderOpen,
  Eye
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

export default function DesignProjectsPage() {
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredProjects = projects?.filter(project =>
    project.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.projectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Design Projects</h1>
          <p className="text-gray-600 mt-1">Manage design projects linked to Project Management</p>
        </div>
        <Link href="/design-management">
          <Button variant="outline">
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5" />
            Available Projects
          </CardTitle>
          <CardDescription>
            Projects from Project Management available for design work
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search projects by name, code, or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Loading projects...</span>
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Projects Available</h3>
              <p className="text-gray-600 mb-6">
                Projects will appear here once created in the Project Management module.
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                <p>✓ Projects are sourced from Project Management</p>
                <p>✓ No separate project creation needed here</p>
                <p>✓ Design workflows link to existing projects</p>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
              <p className="text-gray-600">
                Try adjusting your search terms to find projects.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <Card key={project.id} className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg line-clamp-2">{project.projectName}</CardTitle>
                        <CardDescription className="text-sm font-medium text-blue-600 mt-1">
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
                        <Building2 className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="line-clamp-1">{project.customerName}</span>
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="text-xs">
                          {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="font-medium">
                          {project.currency} {parseFloat(project.projectValue).toLocaleString()}
                        </span>
                      </div>
                      
                      {project.description && (
                        <p className="text-sm text-gray-600 line-clamp-3 mt-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    
                    <div className="mt-6 pt-4 border-t space-y-2">
                      <Button variant="default" size="sm" className="w-full">
                        <FolderKanban className="h-3 w-3 mr-2" />
                        Start Design Work
                      </Button>
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye className="h-3 w-3 mr-2" />
                        View Project Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {projects && projects.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Showing {filteredProjects.length} of {projects.length} projects
                </span>
                <span>
                  Total Project Value: {projects.reduce((sum, project) => sum + parseFloat(project.projectValue), 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}