import React from "react";
import ProjectDetail from "@/components/project-detail";
import { useParams } from "wouter";
import { Loader2 } from "lucide-react";

export default function ProjectDetailPage() {
  const { id } = useParams();
  
  if (!id) {
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