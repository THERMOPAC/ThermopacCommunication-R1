import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { SapAuthGuard } from '@/components/sap/SapAuthGuard';
import { Link } from 'wouter';
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
  Calendar,
  RefreshCw,
  Loader2,
  Clock,
  TrendingUp,
  TrendingDown,
  Building2,
  Users,
  Eye,
  Square,
} from 'lucide-react';

interface DashboardData {
  purchaseOrders: {
    total: number;
    pending: number;
    approved: number;
    totalValue: number;
  };
  purchaseInvoices: {
    total: number;
    pending: number;
    paid: number;
    totalValue: number;
  };
  vendors: {
    total: number;
    active: number;
  };
  goodsReceipt: {
    total: number;
    pending: number;
    completed: number;
  };
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
    amount?: number;
  }>;
  alerts: string[];
  fyStartDate?: string;
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
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
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

  const updateSyncSettings = useMutation({
    mutationFn: async (settings: { fyStartDate: string }) => {
      const response = await fetch('/api/sap/b1/purchase/sync/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fyStartDate: settings.fyStartDate,
          autoSyncEnabled: true,
          syncIntervalMinutes: 60,
          businessHoursStart: '09:00',
          businessHoursEnd: '20:00',
          businessTimezone: 'Asia/Kolkata'
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Settings update failed');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase'] });
      toast({
        title: "Date Range Updated",
        description: `Custom sync date range set to ${fmtDate(variables.fyStartDate)} onwards. Click "Sync Now" to apply changes.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed", 
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sap/b1/purchase/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync failed to start');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/sync/status'] });
      const documentsProcessed = data?.data?.documentsProcessed || 0;
      toast({
        title: documentsProcessed > 0 ? "Sync Completed" : "Sync Issue Detected",
        description: documentsProcessed > 0 
          ? `Successfully synced ${documentsProcessed} records from SAP`
          : "Sync started but no records were processed. Check SAP connection.",
        variant: documentsProcessed > 0 ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const stopSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sap/b1/purchase/sync/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to stop sync');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/sync/status'] });
      toast({
        title: "Sync Stopped",
        description: "SAP data synchronization has been stopped successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Stop Sync Failed", 
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const triggerLineItemsSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sap/b1/purchase/sync/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Line items sync failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      const lineItemsProcessed = data?.data?.lineItemsProcessed || 0;
      const ordersProcessed = data?.data?.ordersProcessed || 0;
      toast({
        title: "Line Items Sync Completed",
        description: `Successfully synced ${lineItemsProcessed} line items from ${ordersProcessed} purchase orders`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Line Items Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFyFilterChange = (value: string) => {
    setFyFilter(value);
    if (value === 'custom') {
      setShowCustomDatePicker(true);
    } else {
      setShowCustomDatePicker(false);
      
      // Apply predefined date ranges
      let startDate: Date;
      if (value === 'current') {
        startDate = new Date('2025-04-01');
      } else if (value === 'previous') {
        startDate = new Date('2024-04-01');
      } else if (value === 'all') {
        startDate = new Date('2020-01-01');
      } else {
        return;
      }
      
      updateSyncSettings.mutate({ 
        fyStartDate: format(startDate, 'yyyy-MM-dd')
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[120px] mb-2" />
                <Skeleton className="h-3 w-[80px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">SAP Service Layer unavailable</h3>
          <p className="text-sm text-gray-600 mt-1">
            Contact admin or use{' '}
            <Link href="/sap-integration" className="text-blue-600 underline font-medium">
              SAP Integration page
            </Link>
            {' '}→ Force Reset.
          </p>
        </div>
      </div>
    );
  }

  if (!data?.data) {
    const responseAny = data as any;
    const isSapUnavailable = responseAny?.status === 'sap_unavailable';
    return (
      <div className="space-y-6">
        {isSapUnavailable && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-7 w-7 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">SAP Service Layer unavailable</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Contact admin or use{' '}
                  <Link href="/sap-integration" className="text-blue-600 underline font-medium">
                    SAP Integration page
                  </Link>
                  {' '}→ Force Reset.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/dashboard'] })}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}
        {!isSapUnavailable && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-[120px] mb-2" />
                  <Skeleton className="h-3 w-[80px]" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
      <div className="space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Financial Year:</span>
                <Select value={fyFilter} onValueChange={handleFyFilterChange}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current FY</SelectItem>
                    <SelectItem value="previous">Previous FY</SelectItem>
                    <SelectItem value="all">All Data</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {dashboardData.fyStartDate && (
                <Badge variant="outline" className="text-xs">
                  From {fmtDate(dashboardData.fyStartDate)}
                </Badge>
              )}
            </div>

            {/* Refresh */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/sap/b1/purchase/dashboard'] })}
                disabled={isLoading}
                className="text-xs"
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Custom Date Range Picker */}
          {showCustomDatePicker && (
            <div className="w-full p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">Custom Date Range</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={syncStatusData?.data?.settings?.fy_start_date || '2024-04-01'}
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onChange={(e) => {
                      if (e.target.value) {
                        updateSyncSettings.mutate({ 
                          fyStartDate: e.target.value
                        });
                      }
                    }}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    To Date (Optional)
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled
                    placeholder="Coming soon"
                  />
                  <p className="text-xs text-gray-500 mt-1">End date filtering coming in next update</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-blue-600">
                  <p>Select custom date range for SAP data synchronization</p>
                  {syncStatusData?.data.settings?.fy_start_date && (
                    <p className="font-medium mt-1">
                      Current range: From {fmtDate(syncStatusData.data.settings.fy_start_date)} onwards
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowCustomDatePicker(false);
                    setFyFilter('current');
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.purchaseOrders?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(dashboardData.purchaseOrders?.totalValue || 0)} total value
            </p>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                <span className="text-xs">Pending: {dashboardData.purchaseOrders?.pending || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs">Approved: {dashboardData.purchaseOrders?.approved || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Invoices</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.purchaseInvoices?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(dashboardData.purchaseInvoices?.totalValue || 0)} total value
            </p>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs">Pending: {dashboardData.purchaseInvoices?.pending || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs">Paid: {dashboardData.purchaseInvoices?.paid || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.vendors?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active: {dashboardData.vendors?.active || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Goods Receipt</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.goodsReceipt?.total || 0}</div>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                <span className="text-xs">Pending: {dashboardData.goodsReceipt?.pending || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs">Completed: {dashboardData.goodsReceipt?.completed || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardData.recentActivity?.length > 0 ? (
                dashboardData.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div>
                        <p className="text-sm font-medium">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                    {activity.amount && (
                      <Badge variant="outline">{formatCurrency(activity.amount)}</Badge>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-8 w-8 mb-2" />
                  <p>No recent activity</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Total PO Value</span>
                <span className="font-medium">{formatCurrency(dashboardData.purchaseOrders?.totalValue || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Total Invoice Value</span>
                <span className="font-medium">{formatCurrency(dashboardData.purchaseInvoices?.totalValue || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Active Vendors</span>
                <span className="font-medium">{dashboardData.vendors?.active || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Pending Receipts</span>
                <span className="font-medium">{dashboardData.goodsReceipt?.pending || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {dashboardData.alerts?.length > 0 && (
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