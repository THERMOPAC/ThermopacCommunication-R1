import { useState } from 'react';
import { format } from 'date-fns';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertCircle, Calendar as CalendarIcon, RefreshCw, TrendingUp, TrendingDown, BarChart3, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Sample data for demonstration
const sampleData = {
  reportDate: new Date().toISOString(),
  period: {
    startDate: 'All Time',
    endDate: 'Present'
  },
  outstandingInvoices: {
    summary: [
      {
        invoice_type: 'Product',
        count: 12,
        total_amount: 456789,
        outstanding_amount: 234567
      },
      {
        invoice_type: 'Service',
        count: 8,
        total_amount: 345678,
        outstanding_amount: 123456
      }
    ],
    aging: [
      {
        aging_period: '0-30 days',
        count: 8,
        outstanding_amount: 150000
      },
      {
        aging_period: '31-60 days',
        count: 6,
        outstanding_amount: 120000
      },
      {
        aging_period: '61-90 days',
        count: 4,
        outstanding_amount: 68000
      },
      {
        aging_period: 'Over 90 days',
        count: 2,
        outstanding_amount: 20023
      }
    ],
    topCustomers: [
      {
        customer_name: 'ABC Industries',
        invoice_count: 5,
        outstanding_amount: 120000
      },
      {
        customer_name: 'XYZ Corporation',
        invoice_count: 3,
        outstanding_amount: 95000
      },
      {
        customer_name: 'Acme Solutions',
        invoice_count: 4,
        outstanding_amount: 78000
      }
    ],
    totalOutstanding: 358023
  },
  advancePayments: {
    breakdown: [
      {
        payment_type: 'Product',
        count: 3,
        total_amount: 150000,
        unallocated_amount: 75000
      },
      {
        payment_type: 'Service',
        count: 2,
        total_amount: 80000,
        unallocated_amount: 45000
      }
    ],
    totalAvailable: 120000
  },
  recentAllocations: {
    recentAllocations: [
      {
        id: 1,
        payment_ref: 'PAY-2022-001',
        invoice_number: 'INV-2022-001',
        allocated_amount: 25000,
        created_at: '2025-05-15T10:30:00.000Z',
        customer_name: 'ABC Industries'
      },
      {
        id: 2,
        payment_ref: 'PAY-2022-002',
        invoice_number: 'INV-2022-003',
        allocated_amount: 15000,
        created_at: '2025-05-14T11:20:00.000Z',
        customer_name: 'XYZ Corporation'
      },
      {
        id: 3,
        payment_ref: 'PAY-2022-003',
        invoice_number: 'INV-2022-007',
        allocated_amount: 18500,
        created_at: '2025-05-13T09:45:00.000Z',
        customer_name: 'Acme Solutions'
      }
    ],
    totalAllocated: 58500
  },
  writeOffs: {
    recentWriteOffs: [
      {
        id: 1,
        invoice_number: 'INV-2022-005',
        amount: 5000,
        reason: 'Goodwill Adjustment',
        created_at: '2025-05-10T14:30:00.000Z',
        customer_name: 'ABC Industries'
      },
      {
        id: 2,
        invoice_number: 'INV-2022-008',
        amount: 3500,
        reason: 'Rounding Difference',
        created_at: '2025-05-09T10:15:00.000Z',
        customer_name: 'XYZ Corporation'
      }
    ],
    byReason: [
      {
        reason: 'Goodwill Adjustment',
        count: 3,
        total_amount: 12000
      },
      {
        reason: 'Rounding Difference',
        count: 5,
        total_amount: 7500
      },
      {
        reason: 'Bad Debt',
        count: 1,
        total_amount: 25000
      }
    ],
    totalWrittenOff: 44500
  },
  healthIndicators: {
    dso: 45.3,
    avgDaysToPayment: 32,
    writeOffPercentage: 1.2,
    outstandingToRevenueRatio: 0.35
  },
  recommendations: {
    priorityActions: [
      {
        action: 'Follow up on aged receivables',
        description: '2 invoices totaling INR 20023 are overdue by more than 90 days.',
        priority: 'High'
      },
      {
        action: 'Allocate advance payments',
        description: '5 advance payments with INR 120000 remain unallocated.',
        priority: 'Medium'
      }
    ],
    generalRecommendations: [
      'Review credit terms with customers that consistently pay late',
      'Consider early payment discounts for customers with large outstanding balances',
      'Implement more regular follow-ups on invoices as they approach 60 days outstanding',
      'Review write-off policies to ensure they align with business goals'
    ]
  }
};

export default function ReconciliationReportPage() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [data, setData] = useState(sampleData);

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
    return data.outstandingInvoices.aging.map(item => ({
      name: item.aging_period,
      value: Number(item.outstanding_amount)
    }));
  };

  // Prepare invoice type data for chart
  const prepareInvoiceTypeData = () => {
    return data.outstandingInvoices.summary.map(item => ({
      name: item.invoice_type,
      value: Number(item.outstanding_amount)
    }));
  };

  return (
    <Layout>
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
            
            <Button onClick={() => setData({...sampleData})} variant="secondary" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
        
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
      </div>
    </Layout>
  );
}