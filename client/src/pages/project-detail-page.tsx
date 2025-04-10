import React, { useEffect } from "react";
import ProjectDetail from "@/components/project-detail-fixed";
import { useLocation, Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectDetailPageProps {
  id?: string;
  params?: {
    id: string;
  };
}

export default function ProjectDetailPage({ id, params }: ProjectDetailPageProps) {
  // If id is not directly provided but is available in params, use it
  const projectId = id || (params && params.id);
  const [location] = useLocation();
  
  // Enhanced debugging for project ID from props
  console.log("ProjectDetailPage - Full URL path:", location);
  console.log("ProjectDetailPage - ID prop:", id);
  console.log("ProjectDetailPage - Params:", params);
  console.log("ProjectDetailPage - ProjectId:", projectId);
  console.log("ProjectDetailPage - ID prop type:", typeof projectId);
  
  useEffect(() => {
    console.log("ProjectDetailPage mounted, ProjectId:", projectId);
    console.log("ProjectDetailPage location:", location);
  }, [projectId, location]);
  
  if (!projectId) {
    console.log("ProjectDetailPage - No Project ID provided");
    return (
      <div className="container mx-auto py-6 flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Missing Project ID</h2>
          <p className="text-muted-foreground">Please select a project from the projects list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/" className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/projects" className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
      <ProjectDetail id={projectId} />
    </div>
  );
}