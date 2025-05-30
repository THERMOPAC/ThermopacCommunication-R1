import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Download,
  Filter,
  FileText,
  Clock,
  ArrowUpDown,
  BarChart2,
  DollarSign,
  BadgeDollarSign,
  Timer,
  User,
  Search,
  Mail,
  Phone
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Link } from 'wouter';

// Define types for our data
type InvoiceAgingSummary = {
  totalOutstanding: number;
  currencyCode: string;
  agingBuckets: {
    [key: string]: {
      count: number;
      amount: number;
      percentage: number;
    };
  };
  customerSummaries: Array<{
    customerId: number;
    customerName: string;
    totalOutstanding: number;
    agingBuckets: {
      [key: string]: number;
    };
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    customerId: number;
    customerName: string;
    issueDate: string;
    dueDate: string;
    amount: number;
    outstandingAmount: number;
    currencyCode: string;
    daysOverdue: number;
    agingBucket: string;
  }>;
  paymentTrends: Array<{
    month: string;
    avgDaysToPayment: number;
    invoiceCount: number;
  }>;
};

// Sample data for development
const sampleAgingData: InvoiceAgingSummary = {
  totalOutstanding: 875000,
  currencyCode: 'INR',
  agingBuckets: {
    'Current': {
      count: 12,
      amount: 320000,
      percentage: 36.57
    },
    '1-30 days': {
      count: 8,
      amount: 250000,
      percentage: 28.57
    },
    '31-60 days': {
      count: 5,
      amount: 155000,
      percentage: 17.71
    },
    '61-90 days': {
      count: 3,
      amount: 85000,
      percentage: 9.71
    },
    '91+ days': {
      count: 2,
      amount: 65000,
      percentage: 7.43
    }
  },
  customerSummaries: [
    {
      customerId: 1,
      customerName: 'ABC Manufacturing Ltd',
      totalOutstanding: 275000,
      agingBuckets: {
        'Current': 95000,
        '1-30 days': 85000,
        '31-60 days': 65000,
        '61-90 days': 30000,
        '91+ days': 0
      },
      contactName: 'John Smith',
      contactEmail: 'john.smith@abcmanufacturing.com',
      contactPhone: '+91 98765 43210'
    },
    {
      customerId: 2,
      customerName: 'XYZ Industries',
      totalOutstanding: 185000,
      agingBuckets: {
        'Current': 75000,
        '1-30 days': 55000,
        '31-60 days': 25000,
        '61-90 days': 0,
        '91+ days': 30000
      },
      contactName: 'Jane Doe',
      contactEmail: 'jane.doe@xyzindustries.com',
      contactPhone: '+91 98765 12345'
    },
    {
      customerId: 3,
      customerName: 'Sunshine Enterprises',
      totalOutstanding: 165000,
      agingBuckets: {
        'Current': 65000,
        '1-30 days': 45000,
        '31-60 days': 20000,
        '61-90 days': 35000,
        '91+ days': 0
      },
      contactName: 'Mike Johnson',
      contactEmail: 'mike@sunshine.com',
      contactPhone: '+91 87654 32109'
    },
    {
      customerId: 4,
      customerName: 'Global Solutions Inc',
      totalOutstanding: 145000,
      agingBuckets: {
        'Current': 45000,
        '1-30 days': 35000,
        '31-60 days': 30000,
        '61-90 days': 0,
        '91+ days': 35000
      },
      contactName: 'Sarah Williams',
      contactEmail: 'sarah@globalsolutions.com',
      contactPhone: '+91 76543 21098'
    },
    {
      customerId: 5,
      customerName: 'Tech Innovators Ltd',
      totalOutstanding: 105000,
      agingBuckets: {
        'Current': 40000,
        '1-30 days': 30000,
        '31-60 days': 15000,
        '61-90 days': 20000,
        '91+ days': 0
      },
      contactName: 'Robert Chen',
      contactEmail: 'robert@techinnovators.com',
      contactPhone: '+91 65432 10987'
    }
  ],
  invoices: [
    {
      id: 101,
      invoiceNumber: 'INV-2022-001',
      customerId: 1,
      customerName: 'ABC Manufacturing Ltd',
      issueDate: '2022-04-15',
      dueDate: '2022-05-15',
      amount: 95000,
      outstandingAmount: 95000,
      currencyCode: 'INR',
      daysOverdue: 0,
      agingBucket: 'Current'
    },
    {
      id: 102,
      invoiceNumber: 'INV-2022-002',
      customerId: 1,
      customerName: 'ABC Manufacturing Ltd',
      issueDate: '2022-03-25',
      dueDate: '2022-04-25',
      amount: 85000,
      outstandingAmount: 85000,
      currencyCode: 'INR',
      daysOverdue: 15,
      agingBucket: '1-30 days'
    },
    {
      id: 103,
      invoiceNumber: 'INV-2022-003',
      customerId: 2,
      customerName: 'XYZ Industries',
      issueDate: '2022-04-05',
      dueDate: '2022-05-05',
      amount: 75000,
      outstandingAmount: 75000,
      currencyCode: 'INR',
      daysOverdue: 0,
      agingBucket: 'Current'
    },
    {
      id: 104,
      invoiceNumber: 'INV-2022-004',
      customerId: 3,
      customerName: 'Sunshine Enterprises',
      issueDate: '2022-02-18',
      dueDate: '2022-03-18',
      amount: 65000,
      outstandingAmount: 55000,
      currencyCode: 'INR',
      daysOverdue: 55,
      agingBucket: '31-60 days'
    },
    {
      id: 105,
      invoiceNumber: 'INV-2022-005',
      customerId: 4,
      customerName: 'Global Solutions Inc',
      issueDate: '2022-01-10',
      dueDate: '2022-02-10',
      amount: 55000,
      outstandingAmount: 35000,
      currencyCode: 'INR',
      daysOverdue: 95,
      agingBucket: '91+ days'
    },
    {
      id: 106,
      invoiceNumber: 'INV-2022-006',
      customerId: 5,
      customerName: 'Tech Innovators Ltd',
      issueDate: '2022-04-01',
      dueDate: '2022-05-01',
      amount: 45000,
      outstandingAmount: 40000,
      currencyCode: 'INR',
      daysOverdue: 0,
      agingBucket: 'Current'
    },
    {
      id: 107,
      invoiceNumber: 'INV-2022-007',
      customerId: 1,
      customerName: 'ABC Manufacturing Ltd',
      issueDate: '2022-02-15',
      dueDate: '2022-03-15',
      amount: 75000,
      outstandingAmount: 65000,
      currencyCode: 'INR',
      daysOverdue: 55,
      agingBucket: '31-60 days'
    },
    {
      id: 108,
      invoiceNumber: 'INV-2022-008',
      customerId: 2,
      customerName: 'XYZ Industries',
      issueDate: '2022-01-05',
      dueDate: '2022-02-05',
      amount: 65000,
      outstandingAmount: 30000,
      currencyCode: 'INR',
      daysOverdue: 95,
      agingBucket: '91+ days'
    }
  ],
  paymentTrends: [
    {
      month: 'Jan 2022',
      avgDaysToPayment: 28,
      invoiceCount: 15
    },
    {
      month: 'Feb 2022',
      avgDaysToPayment: 32,
      invoiceCount: 18
    },
    {
      month: 'Mar 2022',
      avgDaysToPayment: 35,
      invoiceCount: 14
    },
    {
      month: 'Apr 2022',
      avgDaysToPayment: 30,
      invoiceCount: 20
    },
    {
      month: 'May 2022',
      avgDaysToPayment: 26,
      invoiceCount: 22
    },
    {
      month: 'Jun 2022',
      avgDaysToPayment: 25,
      invoiceCount: 19
    }
  ]
};

export default function InvoiceAgingDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });
  const [selectedTab, setSelectedTab] = useState('overview');

  // Fetch real invoice aging data from the API
  const { data, isLoading, error } = useQuery<InvoiceAgingSummary>({
    queryKey: ['/api/finance/reports/invoice-aging', dateRange.from, dateRange.to],
    queryFn: async () => {
      const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
      const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
      
      const url = `/api/finance/reports/invoice-aging?startDate=${startDate}&endDate=${endDate}&currency=USD`;
      console.log('Fetching invoice aging from:', url);
      
      const response = await fetch(url);
      console.log('Invoice aging response status:', response.status);
      
      if (!response.ok) {
        console.error('Invoice aging response not ok:', response.status, response.statusText);
        throw new Error(`Failed to fetch invoice aging data: ${response.status}`);
      }
      
      const responseText = await response.text();
      console.log('Invoice aging raw response text:', responseText);
      
      try {
        const jsonData = JSON.parse(responseText);
        console.log('Invoice aging parsed JSON:', jsonData);
        return jsonData;
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        console.error('Response text was:', responseText);
        throw new Error('Invalid JSON response from server');
      }
    },
    enabled: !!dateRange.from && !!dateRange.to,
    retry: 1
  });

  // Format currency
  const formatCurrency = (amount: number, currencyCode: string = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Filter invoices based on search term
  const filteredInvoices = data ? data.invoices.filter(invoice => 
    invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  // Sort customers by total outstanding
  const sortedCustomers = data ? [...data.customerSummaries].sort((a, b) => 
    b.totalOutstanding - a.totalOutstanding
  ) : [];

  // Prepare data for aging chart
  const agingChartData = data ? Object.entries(data.agingBuckets).map(([bucket, stats]) => ({
    name: bucket,
    value: stats.amount
  })) : [];

  // Prepare data for payment trend chart
  const paymentTrendChartData = data ? data.paymentTrends : [];

  // Generate colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  const AGING_COLORS = {
    'Current': '#00C49F',
    '1-30 days': '#FFBB28',
    '31-60 days': '#FFA500',
    '61-90 days': '#FF8042',
    '91+ days': '#FF0000'
  };

  // Format date
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy');
  };

  // Get CSS class for aging bucket
  const getAgingBucketClass = (bucket: string) => {
    switch (bucket) {
      case 'Current':
        return 'bg-green-100 text-green-800';
      case '1-30 days':
        return 'bg-yellow-100 text-yellow-800';
      case '31-60 days':
        return 'bg-orange-100 text-orange-800';
      case '61-90 days':
        return 'bg-amber-100 text-amber-800';
      case '91+ days':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper to determine priority level based on aging bucket
  const getPriorityLevel = (bucket: string) => {
    switch (bucket) {
      case 'Current':
        return 'Low';
      case '1-30 days':
        return 'Low';
      case '31-60 days':
        return 'Medium';
      case '61-90 days':
        return 'High';
      case '91+ days':
        return 'Critical';
      default:
        return 'Unknown';
    }
  };

  // For the follow-up action text
  const getFollowUpAction = (bucket: string) => {
    switch (bucket) {
      case 'Current':
        return 'No action needed';
      case '1-30 days':
        return 'Send gentle reminder';
      case '31-60 days':
        return 'Follow up by email and phone';
      case '61-90 days':
        return 'Escalate to manager and schedule call';
      case '91+ days':
        return 'Urgent escalation, consider collection actions';
      default:
        return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-screen">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p>Loading aging report...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    console.error('Invoice aging error:', error);
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load the invoice aging report. Please try again later.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-screen">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p>Loading aging report...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  console.log('Invoice aging data received:', data);

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Invoice Aging Dashboard</h1>
            <p className="text-muted-foreground">
              Analyze outstanding invoices and track collection efforts
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 mt-4 md:mt-0">
            <Button variant="outline" onClick={() => setFilterOpen(!filterOpen)}>
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" asChild>
              <Link href="/finance/reports/invoice-aging/download">
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Link>
            </Button>
          </div>
        </div>

        {filterOpen && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">From Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.from ? format(dateRange.from, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => setDateRange({ ...dateRange, from: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">To Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.to ? format(dateRange.to, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => setDateRange({ ...dateRange, to: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search by invoice# or customer"
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(data.totalOutstanding, data.currencyCode)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {data.invoices.length} invoices
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overdue (more than 30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(
                  Object.entries(data.agingBuckets)
                    .filter(([bucket]) => bucket !== 'Current' && bucket !== '1-30 days')
                    .reduce((sum, [_, stats]) => sum + stats.amount, 0),
                  data.currencyCode
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {Object.entries(data.agingBuckets)
                  .filter(([bucket]) => bucket !== 'Current' && bucket !== '1-30 days')
                  .reduce((sum, [_, stats]) => sum + stats.count, 0)} invoices
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Severely Overdue (more than 90 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(
                  data.agingBuckets['91+ days']?.amount || 0,
                  data.currencyCode
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.agingBuckets['91+ days']?.count || 0} invoices requiring immediate action
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Days to Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.paymentTrends[data.paymentTrends.length - 1].avgDaysToPayment} days
              </div>
              <div className="flex items-center mt-1">
                {data.paymentTrends[data.paymentTrends.length - 1].avgDaysToPayment < 
                 data.paymentTrends[data.paymentTrends.length - 2].avgDaysToPayment ? (
                  <div className="flex items-center text-green-600 text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1 rotate-180" />
                    Improving
                  </div>
                ) : (
                  <div className="flex items-center text-red-600 text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Worsening
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customers">Customer Analysis</TabsTrigger>
            <TabsTrigger value="invoices">Invoice Details</TabsTrigger>
            <TabsTrigger value="trends">Payment Trends</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Aging Distribution</CardTitle>
                  <CardDescription>Outstanding amounts by aging period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={agingChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {agingChartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={AGING_COLORS[entry.name as keyof typeof AGING_COLORS] || COLORS[index % COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          formatter={(value: number) => [formatCurrency(value, data.currencyCode), 'Outstanding']} 
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Aging Summary</CardTitle>
                  <CardDescription>Invoice counts and amounts by aging period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(data.agingBuckets).map(([bucket, stats]) => (
                      <div key={bucket}>
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center">
                            <Badge className={getAgingBucketClass(bucket)}>{bucket}</Badge>
                            <span className="ml-2 text-sm">{stats.count} invoices</span>
                          </div>
                          <span className="font-medium">{formatCurrency(stats.amount, data.currencyCode)}</span>
                        </div>
                        <Progress 
                          value={stats.percentage} 
                          className={cn("h-2", {
                            "bg-green-100": bucket === 'Current',
                            "bg-yellow-100": bucket === '1-30 days',
                            "bg-orange-100": bucket === '31-60 days',
                            "bg-amber-100": bucket === '61-90 days',
                            "bg-red-100": bucket === '91+ days',
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Collection Priorities</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center">
                          <Badge className="bg-red-100 text-red-800">Critical</Badge>
                          <span className="ml-2">91+ days overdue</span>
                        </div>
                        <Link 
                          href="/finance/invoices?filter=91plus" 
                          className="text-primary hover:underline"
                        >
                          {data.agingBuckets['91+ days']?.count || 0} invoices
                        </Link>
                      </div>
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center">
                          <Badge className="bg-amber-100 text-amber-800">High</Badge>
                          <span className="ml-2">61-90 days overdue</span>
                        </div>
                        <Link 
                          href="/finance/invoices?filter=61to90" 
                          className="text-primary hover:underline"
                        >
                          {data.agingBuckets['61-90 days']?.count || 0} invoices
                        </Link>
                      </div>
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center">
                          <Badge className="bg-orange-100 text-orange-800">Medium</Badge>
                          <span className="ml-2">31-60 days overdue</span>
                        </div>
                        <Link 
                          href="/finance/invoices?filter=31to60" 
                          className="text-primary hover:underline"
                        >
                          {data.agingBuckets['31-60 days']?.count || 0} invoices
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Top 5 Customers with Highest Outstanding</CardTitle>
                <CardDescription>Focus collection efforts on these accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total Outstanding</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>1-30 days</TableHead>
                        <TableHead>31-60 days</TableHead>
                        <TableHead>61-90 days</TableHead>
                        <TableHead>91+ days</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCustomers.slice(0, 5).map((customer) => {
                        // Determine the highest priority aging bucket for this customer
                        const buckets = ['91+ days', '61-90 days', '31-60 days', '1-30 days', 'Current'];
                        const highestPriorityBucket = buckets.find(bucket => 
                          customer.agingBuckets[bucket] > 0
                        ) || 'Current';
                        const priority = getPriorityLevel(highestPriorityBucket);
                        
                        return (
                          <TableRow key={customer.customerId}>
                            <TableCell className="font-medium">
                              <Link 
                                href={`/finance/customers/${customer.customerId}`} 
                                className="text-primary hover:underline"
                              >
                                {customer.customerName}
                              </Link>
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(customer.totalOutstanding, data.currencyCode)}
                            </TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['Current'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['1-30 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['31-60 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['61-90 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['91+ days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>
                              <Badge className={cn({
                                "bg-green-100 text-green-800": priority === 'Low',
                                "bg-orange-100 text-orange-800": priority === 'Medium',
                                "bg-amber-100 text-amber-800": priority === 'High',
                                "bg-red-100 text-red-800": priority === 'Critical',
                              })}>
                                {priority}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Customer Analysis Tab */}
          <TabsContent value="customers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Aging Analysis</CardTitle>
                <CardDescription>Detailed aging breakdown by customer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total Outstanding</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>1-30 days</TableHead>
                        <TableHead>31-60 days</TableHead>
                        <TableHead>61-90 days</TableHead>
                        <TableHead>91+ days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCustomers.map((customer) => {
                        // Determine the highest priority aging bucket for this customer
                        const buckets = ['91+ days', '61-90 days', '31-60 days', '1-30 days', 'Current'];
                        const highestPriorityBucket = buckets.find(bucket => 
                          customer.agingBuckets[bucket] > 0
                        ) || 'Current';
                        const priority = getPriorityLevel(highestPriorityBucket);
                        
                        return (
                          <TableRow key={customer.customerId}>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  <Link 
                                    href={`/finance/customers/${customer.customerId}`} 
                                    className="text-primary hover:underline"
                                  >
                                    {customer.customerName}
                                  </Link>
                                </div>
                                {customer.contactName && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Contact: {customer.contactName}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(customer.totalOutstanding, data.currencyCode)}
                            </TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['Current'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['1-30 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['31-60 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['61-90 days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>{formatCurrency(customer.agingBuckets['91+ days'] || 0, data.currencyCode)}</TableCell>
                            <TableCell>
                              <Badge className={cn({
                                "bg-green-100 text-green-800": priority === 'Low',
                                "bg-orange-100 text-orange-800": priority === 'Medium',
                                "bg-amber-100 text-amber-800": priority === 'High',
                                "bg-red-100 text-red-800": priority === 'Critical',
                              })}>
                                {priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                {customer.contactEmail && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" asChild>
                                          <Link href={`mailto:${customer.contactEmail}`}>
                                            <Mail className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Email Contact</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {customer.contactPhone && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" asChild>
                                          <Link href={`tel:${customer.contactPhone}`}>
                                            <Phone className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Call Contact</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" asChild>
                                        <Link href={`/finance/customers/${customer.customerId}/statement`}>
                                          <FileText className="h-4 w-4" />
                                        </Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Generate Statement</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Invoice Details Tab */}
          <TabsContent value="invoices" className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by invoice# or customer"
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Invoice Aging Details</CardTitle>
                <CardDescription>All outstanding invoices with aging information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Days Overdue</TableHead>
                        <TableHead>Aging Period</TableHead>
                        <TableHead>Action Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            <Link 
                              href={`/finance/invoices/${invoice.id}`} 
                              className="text-primary hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{invoice.customerName}</TableCell>
                          <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                          <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(invoice.amount, invoice.currencyCode)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(invoice.outstandingAmount, invoice.currencyCode)}
                          </TableCell>
                          <TableCell>
                            {invoice.daysOverdue > 0 ? (
                              <span className={cn("font-medium", {
                                "text-yellow-600": invoice.daysOverdue <= 30,
                                "text-orange-600": invoice.daysOverdue > 30 && invoice.daysOverdue <= 60,
                                "text-amber-600": invoice.daysOverdue > 60 && invoice.daysOverdue <= 90,
                                "text-red-600": invoice.daysOverdue > 90,
                              })}>
                                {invoice.daysOverdue} days
                              </span>
                            ) : (
                              <span className="text-green-600">Not due</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={getAgingBucketClass(invoice.agingBucket)}>
                              {invoice.agingBucket}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help">
                                    {getPriorityLevel(invoice.agingBucket)} Priority
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="font-medium">Recommended Action:</p>
                                  <p className="text-sm">{getFollowUpAction(invoice.agingBucket)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Payment Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Trends</CardTitle>
                  <CardDescription>Average days to payment over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={paymentTrendChartData}
                        margin={{
                          top: 5,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="avgDaysToPayment"
                          name="Avg. Days to Payment"
                          stroke="#8884d8"
                          activeDot={{ r: 8 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Collection Efficiency</CardTitle>
                  <CardDescription>Invoice count and payment timing trends</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={paymentTrendChartData}
                        margin={{
                          top: 5,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                        <RechartsTooltip />
                        <Legend />
                        <Bar
                          yAxisId="left"
                          dataKey="invoiceCount"
                          name="Invoice Count"
                          fill="#8884d8"
                        />
                        <Bar
                          yAxisId="right"
                          dataKey="avgDaysToPayment"
                          name="Avg. Days to Payment"
                          fill="#82ca9d"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Collection Insights</CardTitle>
                <CardDescription>Key observations and recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 bg-blue-100 text-blue-800 p-1.5 rounded-full">
                      <BarChart2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">Payment Trend Analysis</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Average days to payment has
                        {data.paymentTrends[data.paymentTrends.length - 1].avgDaysToPayment < 
                         data.paymentTrends[data.paymentTrends.length - 2].avgDaysToPayment
                         ? " improved"
                         : " worsened"} compared to last month. The current average is {data.paymentTrends[data.paymentTrends.length - 1].avgDaysToPayment} days.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 bg-yellow-100 text-yellow-800 p-1.5 rounded-full">
                      <BadgeDollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">Overdue Collection Opportunities</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCurrency(
                          Object.entries(data.agingBuckets)
                            .filter(([bucket]) => bucket !== 'Current')
                            .reduce((sum, [_, stats]) => sum + stats.amount, 0),
                          data.currencyCode
                        )} in overdue invoices represents a significant cash flow opportunity.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 bg-red-100 text-red-800 p-1.5 rounded-full">
                      <Timer className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">Critical Aging Alert</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {data.agingBuckets['91+ days']?.count || 0} invoices totaling {formatCurrency(data.agingBuckets['91+ days']?.amount || 0, data.currencyCode)} are severely overdue (91+ days) and require immediate attention.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 bg-green-100 text-green-800 p-1.5 rounded-full">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">Customer Focus</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Top 3 customers represent {(
                          (sortedCustomers.slice(0, 3).reduce((sum, customer) => sum + customer.totalOutstanding, 0) / 
                          data.totalOutstanding) * 100
                        ).toFixed(1)}% of outstanding receivables. Focus collection efforts on these accounts for maximum impact.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}