import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ShoppingCart, 
  Package, 
  FileText, 
  Receipt, 
  Users, 
  TrendingUp,
  Calendar,
  DollarSign,
  Search,
  Filter,
  Eye,
  Edit,
  Download,
  Database,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Types for Purchase module data
interface PurchaseOrder {
  docEntry: number;
  docNum: string;
  docDate: string;
  vendorCode: string;
  vendorName: string;
  docTotal: number;
  docCurrency: string;
  docStatus: string;
  comments: string;
}

interface PurchaseStats {
  totalOrders: number;
  pendingOrders: number;
  totalValue: number;
  activeVendors: number;
}

export default function PurchaseModule() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dashboard statistics
  const { data: statsResponse, isLoading: statsLoading } = useQuery<{ success: boolean, data: PurchaseStats }>({
    queryKey: ['/api/sap/purchase/dashboard-stats'],
    enabled: activeTab === 'dashboard'
  });
  
  const stats = statsResponse?.data;

  // Fetch purchase orders
  const { data: purchaseOrdersResponse, isLoading: ordersLoading } = useQuery<{ success: boolean, data: PurchaseOrder[] }>({
    queryKey: ['/api/sap/purchase/purchase-orders'],
    enabled: activeTab === 'purchase-orders' || activeTab === 'dashboard'
  });
  
  const purchaseOrders = purchaseOrdersResponse?.data || [];

  // Fetch purchase requisitions
  const { data: requisitions, isLoading: requisitionsLoading } = useQuery({
    queryKey: ['/api/sap/purchase/purchase-requisitions'],
    enabled: activeTab === 'requisitions'
  });

  // Fetch goods receipt
  const { data: goodsReceipt, isLoading: goodsReceiptLoading } = useQuery({
    queryKey: ['/api/sap/purchase/goods-receipt'],
    enabled: activeTab === 'goods-receipt'
  });

  // Fetch purchase invoices
  const { data: purchaseInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/sap/purchase/purchase-invoices'],
    enabled: activeTab === 'invoices'
  });

  // Fetch vendor data
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['/api/sap/purchase/vendors'],
    enabled: activeTab === 'vendors'
  });

  // SAP B1 Connection Test Mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/sap/test-connection');
      return response;
    },
    onSuccess: (data) => {
      if (data.success) {
        setConnectionStatus('connected');
        toast({
          title: "SAP B1 Connection Successful",
          description: "Connected to SAP B1 database successfully",
          variant: "default"
        });
      } else {
        setConnectionStatus('disconnected');
        toast({
          title: "SAP B1 Connection Failed",
          description: data.message || "Failed to connect to SAP B1 database",
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      setConnectionStatus('disconnected');
      toast({
        title: "SAP B1 Connection Error",
        description: error.message || "Connection test failed",
        variant: "destructive"
      });
    }
  });

  // Sync SAP B1 Data Mutation
  const syncDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/sap/sync-data');
      return response;
    },
    onSuccess: (data) => {
      // Invalidate all purchase-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/sap/purchase'] });
      toast({
        title: "SAP B1 Data Sync Successful",
        description: "Purchase data synchronized from SAP B1",
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({
        title: "SAP B1 Data Sync Failed",
        description: error.message || "Failed to sync data from SAP B1",
        variant: "destructive"
      });
    }
  });

  // Dashboard Statistics Cards
  const StatCard = ({ title, value, icon: Icon, color = "blue" }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 text-${color}-600`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  // Purchase Orders Table
  const PurchaseOrdersTable = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search purchase orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <select 
            className="border rounded px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="O">Open</option>
            <option value="C">Closed</option>
          </select>
        </div>
        <Button>
          <FileText className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="text-center py-8">Loading purchase orders...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders?.map((order) => (
                  <TableRow key={order.docEntry}>
                    <TableCell className="font-medium">{order.docNum}</TableCell>
                    <TableCell>{new Date(order.docDate).toLocaleDateString()}</TableCell>
                    <TableCell>{order.vendorName}</TableCell>
                    <TableCell>{order.docCurrency} {order.docTotal.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={order.docStatus === 'O' ? 'default' : 'secondary'}>
                        {order.docStatus === 'O' ? 'Open' : 'Closed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">SAP B1 Purchase Module</h1>
          <p className="text-gray-600 mt-2">Manage purchase orders, requisitions, and vendor relationships</p>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700">
          SAP B1 Integration
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
          <TabsTrigger value="goods-receipt">Goods Receipt</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Purchase Orders"
              value={stats?.totalOrders || 0}
              icon={ShoppingCart}
              color="blue"
            />
            <StatCard
              title="Pending Orders"
              value={stats?.pendingOrders || 0}
              icon={Calendar}
              color="orange"
            />
            <StatCard
              title="Total Value"
              value={`₹${stats?.totalValue?.toLocaleString() || 0}`}
              icon={DollarSign}
              color="green"
            />
            <StatCard
              title="Active Vendors"
              value={stats?.activeVendors || 0}
              icon={Users}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Recent Purchase Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="text-center py-8">Loading statistics...</div>
                ) : (
                  <div className="space-y-4">
                    {purchaseOrders.slice(0, 5).map((order) => (
                      <div key={order.docEntry} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{order.docNum}</p>
                          <p className="text-sm text-gray-600">{order.vendorName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{order.docCurrency} {order.docTotal.toLocaleString()}</p>
                          <Badge variant={order.docStatus === 'O' ? 'default' : 'secondary'} className="text-xs">
                            {order.docStatus === 'O' ? 'Open' : 'Closed'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Create Purchase Order
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Receipt className="h-4 w-4 mr-2" />
                    Create Purchase Requisition
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Package className="h-4 w-4 mr-2" />
                    Record Goods Receipt
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Vendors
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="h-5 w-5 mr-2" />
                  SAP B1 Integration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Connection Status:</span>
                    <div className="flex items-center">
                      {connectionStatus === 'connected' && (
                        <>
                          <Wifi className="h-4 w-4 text-green-500 mr-1" />
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            Connected
                          </Badge>
                        </>
                      )}
                      {connectionStatus === 'disconnected' && (
                        <>
                          <WifiOff className="h-4 w-4 text-red-500 mr-1" />
                          <Badge variant="destructive">Disconnected</Badge>
                        </>
                      )}
                      {connectionStatus === 'unknown' && (
                        <>
                          <Database className="h-4 w-4 text-gray-500 mr-1" />
                          <Badge variant="secondary">Unknown</Badge>
                        </>
                      )}
                    </div>
                  </div>

                  <Button 
                    className="w-full justify-start"
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
                    className="w-full justify-start" 
                    variant="outline"
                    onClick={() => syncDataMutation.mutate()}
                    disabled={syncDataMutation.isPending || connectionStatus !== 'connected'}
                  >
                    {syncDataMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync SAP B1 Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="purchase-orders">
          <PurchaseOrdersTable />
        </TabsContent>

        <TabsContent value="requisitions">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Requisitions</CardTitle>
            </CardHeader>
            <CardContent>
              {requisitionsLoading ? (
                <div className="text-center py-8">Loading requisitions...</div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Purchase requisitions will be displayed here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goods-receipt">
          <Card>
            <CardHeader>
              <CardTitle>Goods Receipt</CardTitle>
            </CardHeader>
            <CardContent>
              {goodsReceiptLoading ? (
                <div className="text-center py-8">Loading goods receipt...</div>
              ) : (
                <div className="text-center py-8">
                  <Receipt className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Goods receipt records will be displayed here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="text-center py-8">Loading invoices...</div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Purchase invoices will be displayed here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors">
          <Card>
            <CardHeader>
              <CardTitle>Vendor Management</CardTitle>
            </CardHeader>
            <CardContent>
              {vendorsLoading ? (
                <div className="text-center py-8">Loading vendors...</div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">Vendor information will be displayed here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}