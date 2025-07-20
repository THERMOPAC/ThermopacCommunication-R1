import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ShieldCheck, ShieldX, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface NonCompliantUser {
  id: number;
  username: string;
  role: string;
  last_password_change: string | null;
  password_needs_update: boolean;
  created_at: string;
  compliance_issue: string;
}

interface ComplianceSummary {
  compliance_status: string;
  user_count: number;
}

interface PasswordComplianceData {
  policyEnforcementDate: string;
  nonCompliantUsers: NonCompliantUser[];
  complianceSummary: ComplianceSummary[];
  totalActiveUsers: number;
  totalNonCompliant: number;
}

export default function PasswordCompliancePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; data: PasswordComplianceData }>({
    queryKey: ['password-compliance', refreshKey],
    queryFn: async () => {
      const response = await fetch('/api/admin/password-compliance', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
  });

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Superuser':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'General Manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Senior Manager':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Manager':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Employee':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getComplianceIcon = (isCompliant: boolean) => {
    return isCompliant ? (
      <ShieldCheck className="h-5 w-5 text-green-600" />
    ) : (
      <ShieldX className="h-5 w-5 text-red-600" />
    );
  };

  if (error) {
    return (
      <div className="container py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load password compliance data'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const complianceData = data?.data;
  const compliantCount = complianceData ? complianceData.totalActiveUsers - complianceData.totalNonCompliant : 0;
  const complianceRate = complianceData ? ((compliantCount / complianceData.totalActiveUsers) * 100).toFixed(1) : '0';

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Password Policy Compliance</h1>
          <p className="text-gray-600 mt-1">
            Monitor user compliance with password security requirements
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : complianceData?.totalActiveUsers || 0}</div>
            <p className="text-xs text-muted-foreground">Active users in system</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliant Users</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{isLoading ? '...' : compliantCount}</div>
            <p className="text-xs text-muted-foreground">Updated passwords since policy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Non-Compliant Users</CardTitle>
            <ShieldX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{isLoading ? '...' : complianceData?.totalNonCompliant || 0}</div>
            <p className="text-xs text-muted-foreground">Require password updates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : `${complianceRate}%`}</div>
            <p className="text-xs text-muted-foreground">Overall compliance percentage</p>
          </CardContent>
        </Card>
      </div>

      {/* Policy Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Password Policy Details
          </CardTitle>
          <CardDescription>
            Security policy enforcement information and requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Policy Enforcement Date</h4>
              <p className="text-sm text-gray-600">
                {complianceData ? format(new Date(complianceData.policyEnforcementDate), 'PPP') : 'Loading...'}
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Password Requirements</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Minimum 12 characters</li>
                <li>• Uppercase and lowercase letters</li>
                <li>• Numbers and special characters</li>
                <li>• Cannot reuse last 5 passwords</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Non-Compliant Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldX className="h-5 w-5 text-red-600" />
            Non-Compliant Users ({complianceData?.totalNonCompliant || 0})
          </CardTitle>
          <CardDescription>
            Users who need to update their passwords to meet security requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading compliance data...</span>
            </div>
          ) : complianceData?.nonCompliantUsers && complianceData.nonCompliantUsers.length > 0 ? (
            <div className="space-y-4">
              {complianceData.nonCompliantUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-red-50"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getComplianceIcon(false)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{user.username}</h4>
                        <Badge className={getRoleColor(user.role)}>{user.role}</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{user.compliance_issue}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          Account Created: {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </span>
                        {user.last_password_change && (
                          <span>
                            Last Password Change: {format(new Date(user.last_password_change), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant="destructive">Action Required</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShieldCheck className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">All Users Compliant</h3>
              <p className="text-gray-600">
                All active users have updated their passwords according to the security policy.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}