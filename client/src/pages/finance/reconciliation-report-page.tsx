import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertCircle, Calendar as CalendarIcon, RefreshCw, TrendingUp, TrendingDown, BarChart3, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
// Using standard table component instead of DataTable
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Define the reconciliation report data structure
type ReconciliationReport = {
  reportDate: string;
  period: {
    startDate: string;
    endDate: string;
  };
  outstandingInvoices: {
    summary: Array<{
      invoice_type: string;
      count: number;
      total_amount: number;
      outstanding_amount: number;
    }>;
    aging: Array<{
      aging_period: string;
      count: number;
      outstanding_amount: number;
    }>;
    topCustomers: Array<{
      customer_name: string;
      invoice_count: number;
      outstanding_amount: number;
    }>;
    totalOutstanding: number;
  };
  advancePayments: {
    breakdown: Array<{
      payment_type: string;
      count: number;
      total_amount: number;
      unallocated_amount: number;
    }>;
    totalAvailable: number;
  };
  recentAllocations: {
    recentAllocations: Array<{
      id: number;
      payment_ref: string;
      invoice_number: string;
      allocated_amount: number;
      created_at: string;
      customer_name: string;
    }>;
    totalAllocated: number;
  };
  writeOffs: {
    recentWriteOffs: Array<{
      id: number;
      invoice_number: string;
      amount: number;
      reason: string;
      created_at: string;
      customer_name: string;
    }>;
    byReason: Array<{
      reason: string;
      count: number;
      total_amount: number;
    }>;
    totalWrittenOff: number;
  };
  healthIndicators: {
    dso: number;
    avgDaysToPayment: number;
    writeOffPercentage: number;
    outstandingToRevenueRatio: number;
  };
  recommendations: {
    priorityActions: Array<{
      action: string;
      description: string;
      priority: string;
    }>;
    generalRecommendations: string[];
  };
};

export default function ReconciliationReportPage() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Fetch reconciliation report data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/finance-reports/reconciliation', startDate, endDate],
    queryFn: async () => {
      let url = '/api/finance-reports/reconciliation';
      const params = new URLSearchParams();
      
      if (startDate) {
        params.append('startDate', format(startDate, 'yyyy-MM-dd'));
      }
      
      if (endDate) {
        params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch reconciliation report');
      }
      
      return response.json() as Promise<ReconciliationReport>;
    }
  });

  // Format currency values
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Generate colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-orange-500';
      case 'low':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  // Prepare aging data for chart
  const prepareAgingData = () => {
    if (!data || !data.outstandingInvoices.aging) return [];
    
    return data.outstandingInvoices.aging.map(item => ({
      name: item.aging_period,
      value: Number(item.outstanding_amount)
    }));
  };

  // Prepare invoice type data for chart
  const prepareInvoiceTypeData = () => {
    if (!data || !data.outstandingInvoices.summary) return [];
    
    return data.outstandingInvoices.summary.map(item => ({
      name: item.invoice_type,
      value: Number(item.outstanding_amount)
    }));
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Financial Reconciliation Report</h1>
          <p className="text-muted-foreground">
            Comprehensive analysis of financial data to track outstanding invoices, advance payments, and overall financial health.
          </p>
        </div>
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
          <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {startDate ? format(startDate, 'PPP') : 'Start Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  setStartDate(date);
                  setStartDateOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {endDate ? format(endDate, 'PPP') : 'End Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => {
                  setEndDate(date);
                  setEndDateOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button onClick={() => refetch()} variant="secondary" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center text-red-700">
              <AlertCircle className="mr-2 h-5 w-5" />
              Error Loading Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              There was an error loading the financial reconciliation report. Please try again or contact system administrator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Report date and period */}
          <div className="mb-6 text-sm text-muted-foreground">
            <p>Report generated on: {format(new Date(data.reportDate), 'PPP p')}</p>
            <p>
              Period: {data.period.startDate !== 'All Time' ? format(new Date(data.period.startDate), 'PPP') : 'All Time'} to {data.period.endDate !== 'Present' ? format(new Date(data.period.endDate), 'PPP') : 'Present'}
            </p>
          </div>
          
          {/* Key metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Outstanding</CardTitle>
                <CardDescription>Current unpaid invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.outstandingInvoices.totalOutstanding)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Across {data.outstandingInvoices.summary.reduce((sum, item) => sum + item.count, 0)} invoices
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Advance Payments</CardTitle>
                <CardDescription>Available for allocation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.advancePayments.totalAvailable)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  From {data.advancePayments.breakdown.reduce((sum, item) => sum + item.count, 0)} advance payments
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Days Sales Outstanding</CardTitle>
                <CardDescription>Collection efficiency</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.healthIndicators.dso.toFixed(1)} days
                </div>
                <div className="flex items-center mt-1">
                  {data.healthIndicators.dso > 45 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-red-500 mr-1" />
                      <p className="text-sm text-red-500">Above target</p>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-green-500 mr-1" />
                      <p className="text-sm text-green-500">Within target</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Write-off Percentage</CardTitle>
                <CardDescription>Revenue loss percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.healthIndicators.writeOffPercentage.toFixed(2)}%
                </div>
                <div className="flex items-center mt-1">
                  {data.healthIndicators.writeOffPercentage > 1.5 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-orange-500 mr-1" />
                      <p className="text-sm text-orange-500">Above threshold</p>
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4 text-green-500 mr-1" />
                      <p className="text-sm text-green-500">Acceptable range</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Priority actions */}
          {data.recommendations.priorityActions.length > 0 && (
            <Card className="mb-8 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
                  Priority Actions Required
                </CardTitle>
                <CardDescription>
                  Based on financial data analysis, these actions require immediate attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.recommendations.priorityActions.map((action, index) => (
                    <li key={index} className="flex gap-2">
                      <div className={cn("font-semibold", getPriorityColor(action.priority))}>
                        [{action.priority}]
                      </div>
                      <div>
                        <div className="font-medium">{action.action}</div>
                        <div className="text-sm text-muted-foreground">{action.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          
          {/* Detailed report sections */}
          <Tabs defaultValue="outstanding">
            <TabsList className="grid grid-cols-4 mb-8">
              <TabsTrigger value="outstanding">Outstanding Invoices</TabsTrigger>
              <TabsTrigger value="advances">Advance Payments</TabsTrigger>
              <TabsTrigger value="allocations">Payment Allocations</TabsTrigger>
              <TabsTrigger value="writeoffs">Write-offs</TabsTrigger>
            </TabsList>
            
            {/* Outstanding Invoices Tab */}
            <TabsContent value="outstanding">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Invoice Aging Analysis</CardTitle>
                    <CardDescription>Outstanding amounts by age</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      {data.outstandingInvoices.aging.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={prepareAgingData()}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                            <Legend />
                            <Bar dataKey="value" name="Outstanding Amount" fill="#8884d8" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          No aging data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Type Breakdown</CardTitle>
                    <CardDescription>Outstanding by invoice type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      {data.outstandingInvoices.summary.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={prepareInvoiceTypeData()}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={(entry) => entry.name}
                            >
                              {prepareInvoiceTypeData().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          No invoice type data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Top Customers with Outstanding Invoices</CardTitle>
                  <CardDescription>Customers with highest outstanding amounts</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.outstandingInvoices.topCustomers.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left border-b">
                            <th className="pb-2">Customer</th>
                            <th className="pb-2">Invoice Count</th>
                            <th className="pb-2 text-right">Outstanding Amount</th>
                            <th className="pb-2 text-right">% of Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.outstandingInvoices.topCustomers.map((customer, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="py-3">{customer.customer_name}</td>
                              <td className="py-3">{customer.invoice_count}</td>
                              <td className="py-3 text-right">{formatCurrency(customer.outstanding_amount)}</td>
                              <td className="py-3 text-right">
                                {data.outstandingInvoices.totalOutstanding > 0
                                  ? ((customer.outstanding_amount / data.outstandingInvoices.totalOutstanding) * 100).toFixed(1)
                                  : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No customer data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Advance Payments Tab */}
            <TabsContent value="advances">
              <Card>
                <CardHeader>
                  <CardTitle>Advance Payment Availability</CardTitle>
                  <CardDescription>Unallocated advance payments by type</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.advancePayments.breakdown.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left border-b">
                            <th className="pb-2">Payment Type</th>
                            <th className="pb-2 text-center">Count</th>
                            <th className="pb-2 text-right">Total Amount</th>
                            <th className="pb-2 text-right">Unallocated Amount</th>
                            <th className="pb-2 text-center">Allocation Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.advancePayments.breakdown.map((item, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="py-3">{item.payment_type}</td>
                              <td className="py-3 text-center">{item.count}</td>
                              <td className="py-3 text-right">{formatCurrency(item.total_amount)}</td>
                              <td className="py-3 text-right">{formatCurrency(item.unallocated_amount)}</td>
                              <td className="py-3">
                                <div className="flex items-center justify-center">
                                  <div className="w-full max-w-xs">
                                    <Progress
                                      value={(item.unallocated_amount / item.total_amount) * 100}
                                      className="h-2"
                                    />
                                    <span className="text-xs text-muted-foreground mt-1 block text-center">
                                      {Math.round((item.unallocated_amount / item.total_amount) * 100)}% available
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-medium">
                            <td className="pt-4">Total</td>
                            <td className="pt-4 text-center">{data.advancePayments.breakdown.reduce((acc, item) => acc + item.count, 0)}</td>
                            <td className="pt-4 text-right">{formatCurrency(data.advancePayments.breakdown.reduce((acc, item) => acc + item.total_amount, 0))}</td>
                            <td className="pt-4 text-right">{formatCurrency(data.advancePayments.totalAvailable)}</td>
                            <td className="pt-4"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No advance payment data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Payment Allocations Tab */}
            <TabsContent value="allocations">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Payment Allocations</CardTitle>
                  <CardDescription>Last 10 payment allocations across all customers</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.recentAllocations.recentAllocations.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left border-b">
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Customer</th>
                            <th className="pb-2">Payment Ref</th>
                            <th className="pb-2">Invoice Number</th>
                            <th className="pb-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentAllocations.recentAllocations.map((allocation, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="py-3">{format(new Date(allocation.created_at), 'PP')}</td>
                              <td className="py-3">{allocation.customer_name}</td>
                              <td className="py-3">{allocation.payment_ref}</td>
                              <td className="py-3">{allocation.invoice_number}</td>
                              <td className="py-3 text-right">{formatCurrency(allocation.allocated_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No recent payment allocations
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Write-offs Tab */}
            <TabsContent value="writeoffs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Write-off Analysis</CardTitle>
                    <CardDescription>Write-offs by reason</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.writeOffs.byReason.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.writeOffs.byReason.map(item => ({
                                name: item.reason,
                                value: item.total_amount
                              }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={(entry) => entry.name}
                            >
                              {data.writeOffs.byReason.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-muted-foreground">
                        No write-off data available
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Write-off Summary</CardTitle>
                    <CardDescription>Total and reason breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="text-2xl font-bold">
                        {formatCurrency(data.writeOffs.totalWrittenOff)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Total write-offs in the selected period
                      </p>
                    </div>
                    
                    {data.writeOffs.byReason.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">By Reason</h4>
                        <ul className="space-y-2">
                          {data.writeOffs.byReason.map((item, index) => (
                            <li key={index} className="flex justify-between text-sm">
                              <span>{item.reason} ({item.count})</span>
                              <span className="font-medium">{formatCurrency(item.total_amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No write-off reasons available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Recent Write-offs</CardTitle>
                  <CardDescription>Last 10 write-offs processed</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.writeOffs.recentWriteOffs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left border-b">
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Customer</th>
                            <th className="pb-2">Invoice</th>
                            <th className="pb-2">Reason</th>
                            <th className="pb-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.writeOffs.recentWriteOffs.map((writeoff, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="py-3">{format(new Date(writeoff.created_at), 'PP')}</td>
                              <td className="py-3">{writeoff.customer_name}</td>
                              <td className="py-3">{writeoff.invoice_number}</td>
                              <td className="py-3">{writeoff.reason}</td>
                              <td className="py-3 text-right">{formatCurrency(writeoff.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No recent write-offs
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* General recommendations */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>General Recommendations</CardTitle>
              <CardDescription>
                Based on financial patterns and best practices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recommendations.generalRecommendations.length > 0 ? (
                <ul className="space-y-2">
                  {data.recommendations.generalRecommendations.map((recommendation, index) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted-foreground">
                  No general recommendations available
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}