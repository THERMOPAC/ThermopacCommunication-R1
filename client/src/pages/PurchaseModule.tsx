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
  orderType: 'Item' | 'Service' | 'Mixed'; // Item/Service classification
  hasItems: boolean;     // If PO contains physical items
  hasServices: boolean;  // If PO contains services
  itemCount: number;     // Number of item lines
  serviceCount: number;  // Number of service lines
  // CapEx/OpEx Classification
  expenditureType: 'CapEx' | 'OpEx' | 'Mixed'; // Capital vs Operational expenditure
  capExLineCount: number;  // Number of CapEx lines
  opExLineCount: number;   // Number of OpEx lines
  capExAmount: number;     // Total CapEx amount
  opExAmount: number;      // Total OpEx amount
  capExPercentage: number; // CapEx percentage of total
  opExPercentage: number;  // OpEx percentage of total
}

interface PurchaseStats {
  totalOrders: number;
  pendingOrders: number;
  totalValue: number;
  activeVendors: number;
  // Enhanced classification statistics
  classification: {
    // Item/Service Classification
    itemOrders: number;
    serviceOrders: number;
    mixedOrders: number;
    // CapEx/OpEx Classification
    capExOrders: number;
    opExOrders: number;
    mixedExpenditureOrders: number;
    // Financial amounts
    totalCapExAmount: number;
    totalOpExAmount: number;
    totalPurchaseAmount: number;
    percentages: {
      itemPercent: number;
      servicePercent: number;
      mixedPercent: number;
      capExPercent: number;
      opExPercent: number;
      mixedExpenditurePercent: number;
    };
  };
  // Monthly and status statistics
  thisMonth: {
    orders: number;
    value: number;
  };
  status: {
    open: number;
    closed: number;
    openPercent: number;
  };
}

// Utility functions for Indian Financial Year (April to March)
const getCurrentIndianFY = (): string => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
  
  if (currentMonth >= 4) {
    // April onwards - current FY
    return `FY${currentYear}-${String(currentYear + 1).slice(-2)}`;
  } else {
    // January to March - previous FY
    return `FY${currentYear - 1}-${String(currentYear).slice(-2)}`;
  }
};

const getIndianFYFromDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  if (month >= 4) {
    return `FY${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `FY${year - 1}-${String(year).slice(-2)}`;
  }
};

const getIndianFYDateRange = (financialYear: string): { startDate: Date; endDate: Date } | null => {
  const fyMatch = financialYear.match(/^FY(\d{4})-(\d{2})$/);
  if (!fyMatch) return null;
  
  const startYear = parseInt(fyMatch[1]);
  const endYear = parseInt(`20${fyMatch[2]}`);
  
  return {
    startDate: new Date(startYear, 3, 1), // April 1st
    endDate: new Date(endYear, 2, 31)     // March 31st
  };
};

// Helper function to format currency in Indian format
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
};

// Helper function to format date for display
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN');
};

export default function PurchaseModule() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [financialYearFilter, setFinancialYearFilter] = useState(getCurrentIndianFY()); // Default to current FY
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
  const PurchaseOrdersTable = ({ searchTerm, statusFilter, financialYear }: { 
    searchTerm: string, 
    statusFilter: string, 
    financialYear: string 
  }) => {
    // Filter purchase orders based on Financial Year, search term, and status
    const filteredOrders = purchaseOrders.filter((order) => {
      // Financial Year filtering
      const orderDate = new Date(order.docDate);
      const orderFY = getIndianFYFromDate(orderDate);
      if (orderFY !== financialYear) return false;
      
      // Search term filtering
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!order.docNum.toLowerCase().includes(search) &&
            !order.vendorName.toLowerCase().includes(search) &&
            !order.comments?.toLowerCase().includes(search)) {
          return false;
        }
      }
      
      // Status filtering
      if (statusFilter !== 'all' && order.docStatus !== statusFilter) {
        return false;
      }
      
      return true;
    });

    return (
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
                  <TableHead>Order Type</TableHead>
                  <TableHead>Expenditure Type</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders?.map((order) => (
                  <TableRow key={order.docEntry}>
                    <TableCell className="font-medium">{order.docNum}</TableCell>
                    <TableCell>{new Date(order.docDate).toLocaleDateString()}</TableCell>
                    <TableCell>{order.vendorName}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          order.orderType === 'Item' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          order.orderType === 'Service' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-purple-50 text-purple-700 border-purple-200'
                        }
                      >
                        {order.orderType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          order.expenditureType === 'CapEx' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          order.expenditureType === 'OpEx' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                          'bg-orange-50 text-orange-700 border-orange-200'
                        }
                      >
                        {order.expenditureType}
                      </Badge>
                    </TableCell>
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
  };

  // Remove the old search controls from the PurchaseOrdersTable since we moved them to the parent
  const filteredOrdersOnDashboard = purchaseOrders.filter((order) => {
    const orderDate = new Date(order.docDate);
    const orderFY = getIndianFYFromDate(orderDate);
    return orderFY === financialYearFilter;
  });

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

          {/* Item/Service Classification Overview */}
          {stats?.classification && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Purchase Order Classification - Item/Service
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Analysis of purchase orders by item and service types
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-700">
                      {stats.classification.itemOrders}
                    </div>
                    <div className="text-sm text-blue-600 font-medium">Item-based POs</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.itemPercent}% of total
                    </div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700">
                      {stats.classification.serviceOrders}
                    </div>
                    <div className="text-sm text-green-600 font-medium">Service-based POs</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.servicePercent}% of total
                    </div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-2xl font-bold text-purple-700">
                      {stats.classification.mixedOrders}
                    </div>
                    <div className="text-sm text-purple-600 font-medium">Mixed POs</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.mixedPercent}% of total
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-gray-500 text-center">
                  Classification based on line item analysis: Items (InvntItem='Y') vs Services (InvntItem='N')
                </div>
              </CardContent>
            </Card>
          )}

          {/* CapEx/OpEx Classification Overview */}
          {stats?.classification && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Expenditure Classification - CapEx/OpEx
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Financial compliance analysis by capital vs operational expenditure
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-2xl font-bold text-amber-700">
                      {stats.classification.capExOrders}
                    </div>
                    <div className="text-sm text-amber-600 font-medium">CapEx Orders</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.capExPercent}% of total
                    </div>
                  </div>
                  <div className="text-center p-4 bg-teal-50 rounded-lg border border-teal-200">
                    <div className="text-2xl font-bold text-teal-700">
                      {stats.classification.opExOrders}
                    </div>
                    <div className="text-sm text-teal-600 font-medium">OpEx Orders</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.opExPercent}% of total
                    </div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-2xl font-bold text-orange-700">
                      {stats.classification.mixedExpenditureOrders}
                    </div>
                    <div className="text-sm text-orange-600 font-medium">Mixed Expenditure</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.classification.percentages.mixedExpenditurePercent}% of total
                    </div>
                  </div>
                </div>
                
                {/* Financial Amount Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-amber-25 rounded-lg border border-amber-100">
                    <div className="text-lg font-semibold text-amber-800">
                      {formatCurrency(stats.classification.totalCapExAmount)}
                    </div>
                    <div className="text-sm text-amber-600">Total CapEx Amount</div>
                    <div className="text-xs text-gray-500 mt-1">Capital expenditure for assets</div>
                  </div>
                  <div className="p-4 bg-teal-25 rounded-lg border border-teal-100">
                    <div className="text-lg font-semibold text-teal-800">
                      {formatCurrency(stats.classification.totalOpExAmount)}
                    </div>
                    <div className="text-sm text-teal-600">Total OpEx Amount</div>
                    <div className="text-xs text-gray-500 mt-1">Operational expenditure</div>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500 text-center">
                  Classification based on account codes: CapEx (1%, 2%, 16%, 17%) vs OpEx (4%, 5%, 6%, 7%) with 70% threshold
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Purchase Orders - {financialYearFilter}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Indian FY (Apr-Mar)
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="text-center py-8">Loading statistics...</div>
                ) : (
                  <div className="space-y-4">
                    {filteredOrdersOnDashboard.slice(0, 5).map((order) => (
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
                  <Eye className="h-5 w-5 mr-2" />
                  Monitoring Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button className="w-full justify-start" onClick={() => setActiveTab('purchase-orders')}>
                    <FileText className="h-4 w-4 mr-2" />
                    View Purchase Orders
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => setActiveTab('requisitions')}>
                    <Receipt className="h-4 w-4 mr-2" />
                    Track Purchase Requisitions
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => setActiveTab('goods-receipt')}>
                    <Package className="h-4 w-4 mr-2" />
                    Monitor Goods Receipt
                  </Button>
                  <Button className="w-full justify-start" variant="outline" onClick={() => setActiveTab('vendors')}>
                    <Users className="h-4 w-4 mr-2" />
                    View Vendor Performance
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Financial Year Overview
                  </div>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                    {financialYearFilter}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600">FY Orders</p>
                      <p className="text-lg font-bold text-blue-700">
                        {filteredOrdersOnDashboard.length}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-sm text-gray-600">FY Value</p>
                      <p className="text-lg font-bold text-green-700">
                        {formatCurrency(filteredOrdersOnDashboard.reduce((sum, order) => sum + order.docTotal, 0))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Period:</span>
                    <span className="font-medium">
                      {financialYearFilter.replace('FY', '').replace('-', ' Apr - 20')} Mar
                    </span>
                  </div>
                  <Button 
                    className="w-full"
                    variant="outline"
                    onClick={() => setActiveTab('purchase-orders')}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View {financialYearFilter} Orders
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
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Purchase Orders - {financialYearFilter}
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    Indian Financial Year (Apr-Mar)
                  </Badge>
                  <Input
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <Label htmlFor="fy-filter" className="text-sm font-medium">Financial Year:</Label>
                <select
                  id="fy-filter"
                  value={financialYearFilter}
                  onChange={(e) => setFinancialYearFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm bg-white"
                >
                  <option value="FY2024-25">FY2024-25 (Apr 2024 - Mar 2025)</option>
                  <option value="FY2023-24">FY2023-24 (Apr 2023 - Mar 2024)</option>
                  <option value="FY2022-23">FY2022-23 (Apr 2022 - Mar 2023)</option>
                  <option value="FY2021-22">FY2021-22 (Apr 2021 - Mar 2022)</option>
                  <option value="FY2020-21">FY2020-21 (Apr 2020 - Mar 2021)</option>
                  <option value="FY2019-20">FY2019-20 (Apr 2019 - Mar 2020)</option>
                </select>
                <Label htmlFor="status-filter" className="text-sm font-medium ml-4">Status:</Label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="O">Open</option>
                  <option value="C">Closed</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <PurchaseOrdersTable searchTerm={searchTerm} statusFilter={statusFilter} financialYear={financialYearFilter} />
            </CardContent>
          </Card>
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