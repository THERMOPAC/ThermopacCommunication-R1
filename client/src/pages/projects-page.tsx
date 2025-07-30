import React from "react";
import ProjectList from "@/components/project-list";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";

export default function ProjectsPage() {
  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC Communication System</title>
      </Helmet>
      <div className="max-w-full px-4 py-6">
        <ProjectList />
      </div>
    </Layout>
  );
}