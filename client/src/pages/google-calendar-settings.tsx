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
    queryKey: ['/api/calendar/status'],
  });

  // Fetch debug information
  const { data: debugInfo } = useQuery({
    queryKey: ['/api/calendar/debug'],
  });

  // Connect Google Calendar mutation
  const connectMutation = useMutation({
    mutationFn: () => {
      setIsConnecting(true);
      // Redirect to Google OAuth URL which will redirect to Google
      window.location.href = '/api/auth/google/calendar';
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
    mutationFn: () => apiRequest('POST', '/api/calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/status'] });
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
    mutationFn: (enabled: boolean) => apiRequest('POST', '/api/calendar/sync/toggle', { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/status'] });
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

        {/* Debug Information Card - Only show when not connected */}
        {!status?.isConnected && debugInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <AlertCircle className="h-5 w-5" />
                Google Cloud Console Setup Required
              </CardTitle>
              <CardDescription>
                If you're seeing a blank page, follow these steps to configure Google Cloud Console:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <p className="font-medium text-blue-900">Current Configuration:</p>
                <ul className="text-sm space-y-1 text-blue-800">
                  <li><strong>Client ID:</strong> {debugInfo.clientId}</li>
                  <li><strong>Redirect URI:</strong> {debugInfo.redirectUri}</li>
                  <li><strong>Required Scopes:</strong> {debugInfo.requiredScopes?.join(', ')}</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <p className="font-medium text-gray-900">✅ Checklist to Resolve "accounts.google.com refused to connect":</p>
                
                <div className="space-y-3">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-semibold text-gray-900">🔹 1. Enable Google Calendar API</h4>
                    <p className="text-sm text-gray-700">
                      Go to <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">APIs & Services → Library</a>
                      <br />Search for "Google Calendar API" and make sure it's enabled for project <strong>thermopac-communication-system</strong>
                    </p>
                  </div>
                  
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-semibold text-gray-900">🔹 2. OAuth Consent Screen Setup</h4>
                    <p className="text-sm text-gray-700">
                      Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">APIs & Services → OAuth consent screen</a>
                      <br />• Publishing Status: <strong>In Production</strong> (not Testing)
                      <br />• Required scopes: calendar, userinfo.email
                      <br />• Add test users if still in Testing mode
                    </p>
                  </div>
                  
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h4 className="font-semibold text-gray-900">🔹 3. Authorized Redirect URI</h4>
                    <p className="text-sm text-gray-700">
                      Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">APIs & Services → Credentials</a>
                      <br />In your OAuth 2.0 Client ID, add this exact redirect URI:
                      <br /><code className="bg-gray-100 px-2 py-1 rounded text-xs">{debugInfo.redirectUri}</code>
                      <br /><span className="text-red-600 text-xs">⚠️ Even a missing / or typo will break it</span>
                    </p>
                  </div>
                  
                  <div className="border-l-4 border-red-500 pl-4">
                    <h4 className="font-semibold text-gray-900">🔹 4. Test OAuth URL Directly</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      If you're still getting "refused to connect", test the OAuth URL directly:
                    </p>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email&prompt=consent&state=service%3Dcalendar&response_type=code&client_id=${debugInfo.clientId}&redirect_uri=${encodeURIComponent(debugInfo.redirectUri)}`;
                        window.open(oauthUrl, '_blank');
                      }}
                      className="mb-2"
                    >
                      Test OAuth URL in New Tab
                    </Button>
                    <p className="text-xs text-gray-600">
                      This will open the OAuth URL in a new tab. If this also shows a blank page, the issue is with your OAuth consent screen configuration.
                    </p>
                  </div>
                  
                  <div className="border-l-4 border-purple-500 pl-4">
                    <h4 className="font-semibold text-gray-900">🔹 4. Avoid Popup Blockers</h4>
                    <p className="text-sm text-gray-700">
                      Make sure popups are enabled for this domain, or the OAuth flow will fail.
                      The system uses window.location.href redirect (not iframe) for better compatibility.
                    </p>
                  </div>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Common Issue:</strong> If you see "accounts.google.com refused to connect", 
                  it usually means the Google Calendar API is not enabled or the OAuth consent screen is not properly configured.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

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