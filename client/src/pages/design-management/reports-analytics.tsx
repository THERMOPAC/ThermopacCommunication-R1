import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart4, Download } from "lucide-react";

export default function ReportsAnalyticsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-600 mt-1">Design performance metrics and project insights</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart4 className="w-5 h-5" />
              Design Analytics Dashboard
            </CardTitle>
            <CardDescription>
              Performance metrics and project insights for design activities
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <BarChart4 className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Reports & Analytics</h3>
            <p className="text-gray-600 mb-6">
              Performance metrics and insights for design activities.<br/>
              Project timelines, design productivity, and deliverable tracking.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Design project performance</p>
              <p>✓ Drawing productivity metrics</p>
              <p>✓ Review cycle analytics</p>
              <p>✓ Timeline and milestone tracking</p>
              <p>✓ Export capabilities</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}