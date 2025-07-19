import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, UserCheck } from "lucide-react";

export default function ReviewApprovalPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Review & Approval</h1>
            <p className="text-gray-600 mt-1">Design review workflow and approval process</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <UserCheck className="w-4 h-4 mr-2" />
            Start Review
          </Button>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              Design Review Workflow
            </CardTitle>
            <CardDescription>
              Multi-stage review process with collaborative feedback
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12">
            <CheckSquare className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Review & Approval System</h3>
            <p className="text-gray-600 mb-6">
              Multi-stage review process for design drawings and documents.<br/>
              Internal reviews, client feedback, and final approval workflow.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Multi-stage review process</p>
              <p>✓ Review assignment to existing users</p>
              <p>✓ Comment and markup system</p>
              <p>✓ Client approval workflow</p>
              <p>✓ Integration with notification system</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}