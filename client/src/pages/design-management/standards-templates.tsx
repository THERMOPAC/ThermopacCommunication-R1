import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCheck, Upload } from "lucide-react";

export default function StandardsTemplatesPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 pl-4">Standards & Templates</h1>
            <p className="text-gray-600 mt-1">Company design standards and template library</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" />
            Upload Template
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Design Standards Library
            </CardTitle>
            <CardDescription>
              Template repository and company standards management
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <FileCheck className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Standards & Templates</h3>
            <p className="text-gray-600 mb-6">
              Template repository for drawing standards and company specifications.<br/>
              CAD blocks, title blocks, and reusable design components.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Drawing template repository</p>
              <p>✓ Company standard formats</p>
              <p>✓ CAD block library</p>
              <p>✓ Title block templates</p>
              <p>✓ Reusable design components</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}