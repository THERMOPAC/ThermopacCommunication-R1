import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Send } from "lucide-react";

export default function TransmittalsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Transmittals</h1>
            <p className="text-gray-600 mt-1">Client submission tracking and document distribution</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Send className="w-4 h-4 mr-2" />
            Create Transmittal
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Drawing Transmittals
            </CardTitle>
            <CardDescription>
              Client submission tracking and document package management
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <Briefcase className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Document Transmittals</h3>
            <p className="text-gray-600 mb-6">
              Client submission tracking system with revision history.<br/>
              Distribution logs and document package generation.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Client submission tracking</p>
              <p>✓ Revision history and logs</p>
              <p>✓ Integration with existing customer data</p>
              <p>✓ Document package generation</p>
              <p>✓ Distribution tracking</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}