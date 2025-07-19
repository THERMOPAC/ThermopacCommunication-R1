import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus } from "lucide-react";

export default function DesignProjectsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Design Projects</h1>
            <p className="text-gray-600 mt-1">Manage design projects linked to Project Management</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Design Project
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5" />
              Design Projects Management
            </CardTitle>
            <CardDescription>
              Create and manage design projects linked to existing projects
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <FolderKanban className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Design Projects</h3>
            <p className="text-gray-600 mb-6">
              Link design workflows to existing Project Management data.<br/>
              Create design phases, assign teams, and track CAD deliverables.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Link to existing Project IDs</p>
              <p>✓ Design phase management</p>
              <p>✓ CAD drawing assignments</p>
              <p>✓ Progress tracking</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}