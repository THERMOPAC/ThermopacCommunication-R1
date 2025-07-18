import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Compass,
  FolderKanban, 
  FileText, 
  CheckSquare, 
  LayoutTemplate, 
  FileCheck,
  Plus,
  Settings,
  TrendingUp,
  Users,
  Clock,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";

export default function DesignManagementPage() {
  const { user } = useAuth();

  // Mock statistics - will be replaced with real data from API
  const designStats = {
    totalProjects: 0,
    activeProjects: 0,
    totalDrawings: 0,
    pendingReviews: 0,
    standardsLibrary: 0,
    transmittals: 0
  };

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Compass className="h-8 w-8 text-blue-600" />
            Design Management
          </h2>
          <p className="text-muted-foreground">
            Comprehensive design project and CAD drawing management system
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Overview Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{designStats.totalProjects}</div>
            <p className="text-xs text-muted-foreground">
              {designStats.activeProjects} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drawing Registry</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{designStats.totalDrawings}</div>
            <p className="text-xs text-muted-foreground">
              CAD drawings managed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{designStats.pendingReviews}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Standards Library</CardTitle>
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{designStats.standardsLibrary}</div>
            <p className="text-xs text-muted-foreground">
              Active standards
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transmittals</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{designStats.transmittals}</div>
            <p className="text-xs text-muted-foreground">
              Client submissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Ready</div>
            <p className="text-xs text-muted-foreground">
              System operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access Modules */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <FolderKanban className="h-5 w-5 text-blue-600" />
              Design Projects
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage design projects, timelines, and team assignments
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Link href="/design-projects">
                <Button variant="outline" size="sm">
                  Access Module
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-green-600" />
              Drawing Registry
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              CAD drawing management with version control
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Link href="/design-drawings">
                <Button variant="outline" size="sm">
                  Access Module
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <CheckSquare className="h-5 w-5 text-orange-600" />
              Design Reviews
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review workflow and approval process management
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Link href="/design-reviews">
                <Button variant="outline" size="sm">
                  Access Module
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <LayoutTemplate className="h-5 w-5 text-purple-600" />
              Design Standards
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Standards and templates repository management
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Link href="/design-standards">
                <Button variant="outline" size="sm">
                  Access Module
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <FileCheck className="h-5 w-5 text-red-600" />
              Drawing Transmittals
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Client and external submission tracking
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Link href="/design-transmittals">
                <Button variant="outline" size="sm">
                  Access Module
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Users className="h-5 w-5 text-indigo-600" />
              Task Management
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Design assignments and progress tracking
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">
                Phase 2 Implementation
              </Badge>
              <Button variant="outline" size="sm" disabled>
                Coming Soon
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Phase Status */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-green-800">
            <CheckSquare className="h-5 w-5" />
            Phase 1 Complete: Database Foundation
          </CardTitle>
        </CardHeader>
        <CardContent className="text-green-700">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              ✅ Database schema implemented (8 core tables)
            </li>
            <li className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              ✅ Foreign key relationships established
            </li>
            <li className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              ✅ Performance indexes created
            </li>
            <li className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              ✅ Data integrity constraints implemented
            </li>
          </ul>
          <div className="mt-4 p-3 bg-white rounded border-l-4 border-blue-500">
            <p className="text-sm text-blue-800">
              <strong>Next Phase:</strong> Core Features implementation including frontend interfaces, 
              API endpoints, and basic CRUD operations for each module.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}