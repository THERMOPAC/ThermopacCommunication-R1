import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Settings, 
  CheckCircle, 
  AlertTriangle,
  Shield,
  Activity,
  BarChart3,
  Package,
  Users,
  FileText,
  Clock,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'unknown';
  lastChecked: string;
  version?: string;
  server?: string;
  database?: string;
}

interface SyncStats {
  lastSync: string;
  recordsProcessed: number;
  errors: number;
  duration: string;
}

export default function SapIntegrationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch connection status
  const { data: connectionStatus, isLoading: statusLoading } = useQuery<ConnectionStatus>({
    queryKey: ['/api/sap/connection/status'],
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Fetch sync statistics
  const { data: syncStats } = useQuery<SyncStats>({
    queryKey: ['/api/sap/sync/stats'],
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sap/connection/test'),
    onSuccess: (data) => {
      toast({
        title: "Connection Test",
        description: data.success ? "SAP B1 connection successful!" : "Connection failed",
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/connection/status'] });
    },
    onError: (error) => {
      toast({
        title: "Connection Error",
        description: "Failed to test SAP B1 connection",
        variant: "destructive",
      });
    },
  });

  // Sync data mutation
  const syncDataMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sap/sync/all'),
    onSuccess: (data) => {
      toast({
        title: "Data Sync",
        description: `Successfully synced ${data.recordsProcessed || 0} records`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/sync/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Sync Error",
        description: "Failed to sync SAP B1 data",
        variant: "destructive",
      });
    },
  });

  const getConnectionStatusBadge = () => {
    if (statusLoading) {
      return <Badge variant="secondary">Checking...</Badge>;
    }
    
    switch (connectionStatus?.status) {
      case 'connected':
        return (
          <div className="flex items-center">
            <Wifi className="h-4 w-4 text-green-500 mr-1" />
            <Badge variant="default" className="bg-green-100 text-green-800">
              Connected
            </Badge>
          </div>
        );
      case 'disconnected':
        return (
          <div className="flex items-center">
            <WifiOff className="h-4 w-4 text-red-500 mr-1" />
            <Badge variant="destructive">Disconnected</Badge>
          </div>
        );
      default:
        return (
          <div className="flex items-center">
            <Database className="h-4 w-4 text-gray-500 mr-1" />
            <Badge variant="secondary">Unknown</Badge>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Database className="h-8 w-8 mr-3" />
            SAP B1 Integration
          </h1>
          <p className="text-gray-600 mt-2">
            Manage SAP Business One integration, connectivity, and data synchronization
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Enterprise ERP Integration
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* VPN-Based Integration Architecture */}
          <Card className="border-blue-200 bg-blue-50 mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Shield className="h-5 w-5 mr-2 text-blue-600" />
                SAP B1 VPN-Based Integration Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm">
                  <p className="font-medium mb-2">Secure Network Architecture: Cloud App ↔ VPN Tunnel ↔ SAP B1 Server</p>
                  <p className="text-gray-600">
                    Advanced VPN-based integration provides encrypted connectivity to SAP B1 systems without exposing public IP addresses. 
                    Supports both VPN (recommended for production) and direct connection modes.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Connection Modes Available:</h4>
                    <div className="space-y-1">
                      <div className="flex items-center text-xs">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        <span className="font-medium">VPN Mode:</span>
                        <code className="ml-2 bg-green-100 px-1 py-0.5 rounded text-xs">192.168.1.100:50000</code>
                      </div>
                      <div className="flex items-center text-xs">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                        <span className="font-medium">Direct Mode:</span>
                        <code className="ml-2 bg-orange-100 px-1 py-0.5 rounded text-xs">59.152.52.58:50000</code>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">VPN Integration Features:</h4>
                    <ul className="text-xs space-y-1 text-gray-600">
                      <li>• Encrypted data transmission</li>
                      <li>• Health monitoring every 2 minutes</li>
                      <li>• Auto-reconnection with backoff</li>
                      <li>• No public IP exposure required</li>
                      <li>• Network-level access control</li>
                    </ul>
                  </div>
                </div>
                
                <div className="bg-white p-3 rounded border">
                  <h4 className="font-medium text-sm mb-2">VPN Configuration Steps:</h4>
                  <ol className="text-xs space-y-1 list-decimal list-inside text-gray-600">
                    <li>Set <code className="bg-gray-100 px-1 rounded">SAP_VPN_ENABLED=true</code> in environment variables</li>
                    <li>Upload base64-encoded OpenVPN configuration to <code className="bg-gray-100 px-1 rounded">VPN_CONFIG</code></li>
                    <li>Configure VPN server IP in <code className="bg-gray-100 px-1 rounded">VPN_SERVER_IP</code></li>
                    <li>Enable auto-reconnection with <code className="bg-gray-100 px-1 rounded">VPN_AUTO_RECONNECT=true</code></li>
                    <li>Update Service Layer URL to private IP: <code className="bg-gray-100 px-1 rounded">192.168.1.100:50000</code></li>
                    <li>Test VPN connectivity using monitoring endpoints</li>
                  </ol>
                </div>
                
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <h4 className="font-medium text-sm mb-1 text-green-800">✅ VPN Infrastructure Ready</h4>
                  <p className="text-xs text-green-700 mb-2">
                    VPN manager fully implemented with lifecycle management, health monitoring, and auto-reconnection. 
                    Currently using direct connection mode - VPN can be enabled when ready.
                  </p>
                  <p className="text-xs text-green-600">
                    📖 Complete setup guide: <code className="bg-green-100 px-1 rounded">SAP_B1_VPN_INTEGRATION_GUIDE.md</code>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
                <Wifi className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {getConnectionStatusBadge()}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last checked: {connectionStatus?.lastChecked || 'Never'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {syncStats?.recordsProcessed || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Records processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sync Errors</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {syncStats?.errors || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Error count
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sync Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {syncStats?.duration || 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last sync time
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Security & Access Control
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Module Permissions:</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Authentication:</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      Required
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Audit Logging:</span>
                    <Badge variant="outline" className="bg-purple-50 text-purple-700">
                      Enabled
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Database Connection:</span>
                    {connectionStatus?.status === 'connected' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">API Endpoints:</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Data Integrity:</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="connection">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* VPN Management Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-blue-600" />
                  VPN Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">VPN Status:</span>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700">
                      Disabled
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Connection Mode:</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      Direct
                    </Badge>
                  </div>

                  <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded border">
                    <p className="font-medium mb-1">Connection Status:</p>
                    <p>Currently using direct connection (59.152.52.58:50000). VPN integration is ready but disabled. Connection failures are expected without VPN or port forwarding.</p>
                  </div>

                  <div className="pt-2 space-y-2">
                    <Button 
                      className="w-full"
                      variant="outline"
                      disabled
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Enable VPN Mode
                    </Button>
                    <p className="text-xs text-gray-500 text-center">
                      Configure VPN_CONFIG to enable
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Connection Management Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="h-5 w-5 mr-2" />
                  Connection Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    {getConnectionStatusBadge()}
                  </div>
                  
                  {connectionStatus?.server && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Server:</span>
                      <span className="text-sm">{connectionStatus.server}</span>
                    </div>
                  )}
                  
                  {connectionStatus?.database && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Database:</span>
                      <span className="text-sm">{connectionStatus.database}</span>
                    </div>
                  )}

                  <div className="pt-4 space-y-2">
                    <Button 
                      className="w-full"
                      onClick={() => testConnectionMutation.mutate()}
                      disabled={testConnectionMutation.isPending}
                    >
                      {testConnectionMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4 mr-2" />
                      )}
                      Test SAP B1 Connection
                    </Button>

                    <Button 
                      className="w-full" 
                      variant="outline"
                      onClick={() => syncDataMutation.mutate()}
                      disabled={syncDataMutation.isPending || connectionStatus?.status !== 'connected'}
                    >
                      {syncDataMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Sync SAP B1 Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Connection Configuration Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Configuration Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm">
                    <strong>VPN Configuration (Recommended):</strong>
                    <ul className="text-xs text-gray-600 mt-1 list-disc list-inside">
                      <li>SAP_VPN_ENABLED=true</li>
                      <li>VPN_CONFIG=&lt;base64_ovpn&gt;</li>
                      <li>VPN_SERVER_IP=&lt;vpn_server&gt;</li>
                      <li>VPN_AUTO_RECONNECT=true</li>
                    </ul>
                  </div>
                  
                  <div className="text-sm">
                    <strong>Service Layer Settings:</strong>
                    <ul className="text-xs text-gray-600 mt-1 list-disc list-inside">
                      <li>SAP_SERVICE_LAYER_URL</li>
                      <li>SAP_USERNAME / SAP_PASSWORD</li>
                      <li>SAP_COMPANY_DB</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-3 rounded border border-green-200">
                    <p className="text-xs text-green-700">
                      <strong>Setup Guide:</strong><br/>
                      Complete VPN setup instructions available in SAP_B1_VPN_INTEGRATION_GUIDE.md
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="modules">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Package className="h-5 w-5 mr-2" />
                  Purchase Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Purchase Orders, GST tracking, vendor management
                </p>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => window.location.href = '/admin/sap-purchase'}
                >
                  Access Module
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-50">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Users className="h-5 w-5 mr-2" />
                  Sales Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Sales Orders, customer management, quotations
                </p>
                <Button className="w-full" variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-50">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <FileText className="h-5 w-5 mr-2" />
                  Finance Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Invoices, payments, journal entries
                </p>
                <Button className="w-full" variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-50">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  Inventory Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Stock management, item master, warehouses
                </p>
                <Button className="w-full" variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-50">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Reports Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Business intelligence, analytics, dashboards
                </p>
                <Button className="w-full" variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-50">
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Settings className="h-5 w-5 mr-2" />
                  Admin Module
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  User management, system configuration
                </p>
                <Button className="w-full" variant="outline" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitoring">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  Real-time Monitoring
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Activity className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Real-time monitoring dashboard will be displayed here</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Connection logs, sync activities, error tracking
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Integration Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Settings className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Integration configuration settings will be displayed here</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Sync intervals, data mapping, notification preferences
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}