import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";

export default function DrawingRegistryPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Drawing Registry</h1>
            <p className="text-gray-600 mt-1">Central repository for CAD drawings and technical documents</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" />
            Upload Drawing
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              CAD Drawing Repository
            </CardTitle>
            <CardDescription>
              Centralized storage for all design drawings with version control
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <FileText className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Drawing Registry</h3>
            <p className="text-gray-600 mb-6">
              Central CAD file repository with Google Cloud Storage integration.<br/>
              Version control, drawing categorization, and technical document management.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ CAD file storage (AutoCAD, SolidWorks, etc.)</p>
              <p>✓ Version control system</p>
              <p>✓ Drawing categorization (P&ID, Layout, Detail)</p>
              <p>✓ Link to Project Items</p>
              <p>✓ Google Cloud Storage integration</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}