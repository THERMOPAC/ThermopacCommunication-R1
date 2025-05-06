import React, { useEffect } from "react";
import ProjectDetail from "@/components/project-detail-fixed";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";

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
      <Layout>
        <Helmet>
          <title>Project Details | THERMOPAC Communication System</title>
        </Helmet>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Missing Project ID</h2>
            <p className="text-muted-foreground">Please select a project from the projects list.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Project Details | THERMOPAC Communication System</title>
      </Helmet>
      <div>
        <ProjectDetail id={projectId} />
      </div>
    </Layout>
  );
}