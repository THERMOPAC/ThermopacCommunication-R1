import React from "react";
import ProjectList from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function ProjectsPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href="/" className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
      <ProjectList />
    </div>
  );
}