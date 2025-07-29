import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, Database, Activity } from 'lucide-react';

interface SecurityDashboardProps {
  testMode: boolean;
}

interface SecurityLogs {
  masking: {
    applied: number;
  };
  audit: {
    total: number;
  };
  routing: {
    optimized: number;
  };
}

export function SecurityDashboard({ testMode }: SecurityDashboardProps) {
  const { data: securityLogs, isLoading } = useQuery<SecurityLogs>({
    queryKey: ['/api/llm/security-logs'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading security analytics...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-2 border-blue-200 bg-blue-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <Shield className="w-5 h-5" />
          Security Dashboard
          {testMode && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
              Test Mode Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Data Masking */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <EyeOff className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-sm text-gray-600">Data Masking</div>
              <div className="text-xl font-semibold">
                {securityLogs?.masking.applied || 0} events
              </div>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-sm text-gray-600">Audit Trail</div>
              <div className="text-xl font-semibold">
                {securityLogs?.audit.total || 0} entries
              </div>
            </div>
          </div>

          {/* Model Routing */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
            <Activity className="w-8 h-8 text-purple-600" />
            <div>
              <div className="text-sm text-gray-600">Smart Routing</div>
              <div className="text-xl font-semibold">
                {securityLogs?.routing.optimized || 0} optimized
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
          <Activity className="w-3 h-3" />
          Real-time security monitoring • Updates every 30 seconds
        </div>
      </CardContent>
    </Card>
  );
}