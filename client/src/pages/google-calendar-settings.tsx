import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Calendar, CheckCircle, AlertCircle, Settings, Link, Unlink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Layout from '@/components/layout';

interface GoogleCalendarStatus {
  isConnected: boolean;
  googleEmail?: string;
  syncEnabled: boolean;
  connectedAt?: string;
}

export default function GoogleCalendarSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Fetch current Google Calendar connection status
  const { data: status, isLoading } = useQuery<GoogleCalendarStatus>({
    queryKey: ['/api/google-calendar/calendar/status'],
  });

  // Connect Google Calendar mutation
  const connectMutation = useMutation({
    mutationFn: () => {
      setIsConnecting(true);
      // Redirect to Google OAuth URL which will redirect to Google
      window.location.href = '/api/google-calendar/auth/google/calendar';
      return Promise.resolve();
    },
    onError: () => {
      setIsConnecting(false);
      toast({
        title: 'Connection Failed',
        description: 'Failed to initiate Google Calendar connection',
        variant: 'destructive',
      });
    },
  });

  // Disconnect Google Calendar mutation
  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/google-calendar/calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-calendar/calendar/status'] });
      toast({
        title: 'Disconnected',
        description: 'Google Calendar has been disconnected successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Disconnection Failed',
        description: 'Failed to disconnect Google Calendar',
        variant: 'destructive',
      });
    },
  });

  // Toggle sync enabled mutation
  const toggleSyncMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest('POST', '/api/google-calendar/calendar/sync/toggle', { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-calendar/calendar/status'] });
      toast({
        title: 'Settings Updated',
        description: 'Google Calendar sync settings updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update sync settings',
        variant: 'destructive',
      });
    },
  });

  const handleConnect = () => {
    connectMutation.mutate();
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  const handleToggleSync = (enabled: boolean) => {
    toggleSyncMutation.mutate(enabled);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Google Calendar Integration</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Google Calendar Integration</h1>
        </div>

      <div className="space-y-6">
        {/* Connection Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Connection Status
            </CardTitle>
            <CardDescription>
              Manage your Google Calendar connection and sync settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Google Calendar</span>
                  {status?.isConnected ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                </div>
                {status?.isConnected && status.googleEmail && (
                  <p className="text-sm text-gray-600">
                    Connected as: {status.googleEmail}
                  </p>
                )}
                {status?.isConnected && status.connectedAt && (
                  <p className="text-xs text-gray-500">
                    Connected on: {new Date(status.connectedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {status?.isConnected ? (
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="h-4 w-4 mr-2" />
                    {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting || connectMutation.isPending}
                  >
                    <Link className="h-4 w-4 mr-2" />
                    {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync Settings Card */}
        {status?.isConnected && (
          <Card>
            <CardHeader>
              <CardTitle>Sync Settings</CardTitle>
              <CardDescription>
                Configure how your meetings sync with Google Calendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="auto-sync">Auto-sync meetings</Label>
                  <p className="text-sm text-gray-600">
                    Automatically create, update, and delete Google Calendar events when meetings change
                  </p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={status.syncEnabled}
                  onCheckedChange={handleToggleSync}
                  disabled={toggleSyncMutation.isPending}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feature Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>
              What you get with Google Calendar integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Automatic Event Creation
                </h4>
                <p className="text-sm text-gray-600">
                  New meetings automatically appear in your Google Calendar
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Real-time Updates
                </h4>
                <p className="text-sm text-gray-600">
                  Meeting changes sync instantly to your calendar
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Attendee Management
                </h4>
                <p className="text-sm text-gray-600">
                  Meeting attendees are automatically invited via email
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Smart Reminders
                </h4>
                <p className="text-sm text-gray-600">
                  Default email and popup reminders keep you on schedule
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Notice */}
        {!status?.isConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Privacy Notice:</strong> We only access your Google Calendar to create and manage events for your meetings. 
              Your calendar data is never stored on our servers, and you can disconnect at any time.
            </AlertDescription>
          </Alert>
        )}
      </div>
      </div>
    </Layout>
  );
}