import { SapAuthGuard } from '@/components/sap/SapAuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  ShoppingCart, 
  FileText, 
  Package, 
  Receipt, 
  AlertTriangle,
  TrendingUp,
  DollarSign,
  RefreshCw,
  Calendar,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';

interface DashboardData {
  summary: {
    openOrders: number;
    totalOrderValue: number;
    pendingInvoices: number;
    pendingReceipts: number;
  };
  recentOrders: Array<{
    DocEntry: number;
    DocNum: string;
    DocTotal: number;
    DocumentStatus: string;
    DocDate: string;
  }>;
  recentQuotations: Array<{
    DocEntry: number;
    DocNum: string;
    DocTotal: number;
    DocumentStatus: string;
    DocDate: string;
  }>;
  alerts: Array<string>;
  fyStartDate: string;
  syncStatus: {
    autoSyncEnabled: boolean;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    syncIntervalMinutes: number;
  } | null;
}

interface SyncSettings {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessTimezone: string;
  fyStartDate: string;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
}

interface SyncStatus {
  settings: SyncSettings;
  recentHistory: Array<{
    id: number;
    sync_type: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    documents_synced: number;
    error_message: string | null;
  }>;
  isRunning: boolean;
}

function DashboardContent() {
  const [fyFilter, setFyFilter] = useState<string>('current');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ success: boolean; data: DashboardData }>({
    queryKey: ['/api/sap/b1/purchase/dashboard'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: syncStatusData } = useQuery<{ success: boolean; data: SyncStatus }>({
    queryKey: ['/api/sap/b1/purchase/sync/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sap/b1/purchase/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync trigger failed');
      }
      return response.json();
    },
    onSuccess: (response) => {
      if (response?.success && response?.message) {
        toast({
          title: "Sync Complete",
          description: response.message,
          duration: 5000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/sync/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed", 
        description: error?.message || "Failed to sync SAP data. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-600 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Failed to Load Dashboard</h3>
            <p className="text-sm text-gray-600">
              {error instanceof Error ? error.message : 'Unable to fetch SAP purchase data'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const dashboardData = data.data;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* FY Filter and Sync Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Financial Year:</span>
            <Select value={fyFilter} onValueChange={setFyFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current FY</SelectItem>
                <SelectItem value="previous">Previous FY</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {dashboardData.fyStartDate && (
            <Badge variant="outline" className="text-xs">
              From {format(new Date(dashboardData.fyStartDate), 'MMM dd, yyyy')}
            </Badge>
          )}
        </div>

        {/* Sync Status and Controls */}
        <div className="flex items-center gap-3">
          {syncStatusData?.data && (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {syncStatusData.data.isRunning ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : syncStatusData.data.settings.lastSyncAt ? (
                  <>
                    <Clock className="h-3 w-3" />
                    <span>
                      Last: {format(new Date(syncStatusData.data.settings.lastSyncAt), 'HH:mm')}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 text-orange-500" />
                    <span>Never synced</span>
                  </>
                )}
              </div>
              
              <Separator orientation="vertical" className="h-4" />
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerSyncMutation.mutate()}
                disabled={triggerSyncMutation.isPending || syncStatusData.data.isRunning}
                className="text-xs"
              >
                {triggerSyncMutation.isPending || syncStatusData.data.isRunning ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Sync Now
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.summary.openOrders}</div>
            <p className="text-xs text-muted-foreground">Active purchase orders</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Order Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(dashboardData.summary.totalOrderValue)}
            </div>
            <p className="text-xs text-muted-foreground">Open orders value</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.summary.pendingInvoices}</div>
            <p className="text-xs text-muted-foreground">Awaiting processing</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Receipts</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.summary.pendingReceipts}</div>
            <p className="text-xs text-muted-foreground">Goods to receive</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders and Quotations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Recent Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.recentOrders.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.recentOrders.map((order, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="font-medium">PO #{order.DocNum}</p>
                        <p className="text-sm text-gray-600">{formatCurrency(order.DocTotal)}</p>
                      </div>
                    </div>
                    <Badge variant={order.DocumentStatus === 'bost_Open' ? 'default' : 'secondary'}>
                      {order.DocumentStatus === 'bost_Open' ? 'Open' : order.DocumentStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 text-center py-4">No recent purchase orders</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Quotations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.recentQuotations.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.recentQuotations.map((quotation, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium">Quote #{quotation.DocNum}</p>
                        <p className="text-sm text-gray-600">{formatCurrency(quotation.DocTotal)}</p>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {quotation.DocumentStatus || 'Draft'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 text-center py-4">No recent quotations</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {dashboardData.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Alerts & Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboardData.alerts.map((alert, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm">{alert}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SapPurchasingDashboard() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SAP Purchase Dashboard</h1>
        <p className="text-gray-600">Overview of purchase orders, quotations, and procurement activities</p>
      </div>
      
      <SapAuthGuard>
        <DashboardContent />
      </SapAuthGuard>
    </div>
  );
}