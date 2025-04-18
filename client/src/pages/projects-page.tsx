import React from "react";
import ProjectList from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";

export default function ProjectsPage() {
  return (
    <Layout>
      <Helmet>
        <title>Projects | THERMOPAC Communication System</title>
      </Helmet>
      <div>
        <ProjectList />
      </div>
    </Layout>
  );
}