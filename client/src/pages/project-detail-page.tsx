import React, { useEffect } from "react";
import ProjectDetail from "@/components/project-detail-fixed";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface ProjectDetailPageProps {
  id?: string;
}

export default function ProjectDetailPage({ id }: ProjectDetailPageProps) {
  const [location] = useLocation();
  
  // Enhanced debugging for project ID from props
  console.log("ProjectDetailPage - Full URL path:", location);
  console.log("ProjectDetailPage - ID prop:", id);
  console.log("ProjectDetailPage - ID prop type:", typeof id);
  
  useEffect(() => {
    console.log("ProjectDetailPage mounted, ID prop:", id);
    console.log("ProjectDetailPage location:", location);
  }, [id, location]);
  
  if (!id) {
    console.log("ProjectDetailPage - No ID provided");
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
      <ProjectDetail id={id} />
    </div>
  );
}