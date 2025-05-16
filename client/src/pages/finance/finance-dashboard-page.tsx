import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import Layout from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, AlertCircle, ChevronRight, ChevronDown, IndianRupee, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { formatRupees, formatDate } from "@/lib/utils";
import { Link } from "wouter";

// Define interfaces for type safety
interface FinanceDashboardData {
  totalInvoices: { count: number; amount: string };
  totalPaid: { count: number; amount: string };
  totalUnpaid: { count: number; amount: string };
  outstandingInvoices: { count: number; amount: string };
  overdueInvoices: { count: number; amount: string };
  totalOutstanding: { count: number; amount: string };
  totalOverdue: { count: number; amount: string };
  totalPayments: { count: number; amount: string };
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    clientName: string;
    issueDate: string;
    dueDate: string;
    amount: string;
    status: string;
  }>;
  latestPayments: Array<{
    id: number;
    referenceNumber: string;
    customerId: number;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    currency: string;
    allocationStatus: string;
  }>;
  monthlyRevenue?: Array<{ month: string; total: string }>;
}

export default function FinanceDashboardPage() {
  const { data, isLoading, error } = useQuery<FinanceDashboardData>({
    queryKey: ['/api/finance/dashboard'],
    retry: 1
  });

  const [selectedTab, setSelectedTab] = useState("overview");

  if (isLoading) {
    return (
      <Layout>
        <Helmet>
          <title>Finance Dashboard | THERMOPAC</title>
        </Helmet>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Finance Dashboard...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Helmet>
          <title>Error | THERMOPAC Finance</title>
        </Helmet>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load finance dashboard data. Please try again later.
          </AlertDescription>
        </Alert>
      </Layout>
    );
  }

  const monthlyData = data?.monthlyRevenue?.map((month: any) => ({
    name: month.month,
    revenue: Number(month.total)
  })) || [];

  return (
    <Layout>
      <Helmet>
        <title>Finance Dashboard | THERMOPAC</title>
      </Helmet>
      <div className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Finance Dashboard</h1>
          <div className="space-x-2">
            <Button variant="outline" asChild>
              <Link href="/finance/invoices/new">New Invoice</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/finance/payments/new">Record Payment</Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Overview Cards */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatRupees(data?.totalInvoices?.amount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.totalInvoices?.count || 0} {data?.totalInvoices?.count === 1 ? 'invoice' : 'invoices'} total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatRupees(data?.outstandingInvoices?.amount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.outstandingInvoices?.count || 0} {data?.outstandingInvoices?.count === 1 ? 'invoice' : 'invoices'} pending
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500">
                    {formatRupees(data?.overdueInvoices?.amount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.overdueInvoices?.count || 0} {data?.overdueInvoices?.count === 1 ? 'invoice' : 'invoices'} overdue
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatRupees(data?.totalPayments?.amount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data?.totalPayments?.count || 0} {data?.totalPayments?.count === 1 ? 'payment' : 'payments'} received
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Monthly Revenue</CardTitle>
                  <CardDescription>Revenue trend over the last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyData}
                        margin={{
                          top: 20,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [formatRupees(value as number), "Revenue"]}
                        />
                        <Bar 
                          dataKey="revenue" 
                          fill="#4f46e5" 
                          name="Revenue" 
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Financial Reports</CardTitle>
                  <CardDescription>Generate and view reports</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/finance/reports/turnover">
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Turnover Report
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/finance/reports/outstanding">
                        <TrendingDown className="mr-2 h-4 w-4" />
                        Outstanding Report
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/finance/reports/remittances">
                        <DollarSign className="mr-2 h-4 w-4" />
                        Inward Remittances
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/finance/brc">
                        <IndianRupee className="mr-2 h-4 w-4" />
                        BRC Management
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Recent Invoices</h2>
              <Button asChild>
                <Link href="/finance/invoices">View All Invoices</Link>
              </Button>
            </div>
            
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Invoice #</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Issue Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Due Date</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data && data.recentInvoices && data.recentInvoices.length > 0 ? (
                    data.recentInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 text-left text-sm">
                          <Link href={`/finance/invoices/${invoice.id}`} className="text-primary hover:underline">
                            {invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-left text-sm">{invoice.clientName}</td>
                        <td className="px-4 py-3 text-left text-sm">{formatDate(new Date(invoice.issueDate))}</td>
                        <td className="px-4 py-3 text-left text-sm">{formatDate(new Date(invoice.dueDate))}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(invoice.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            invoice.status === 'Paid' 
                              ? 'bg-green-100 text-green-800' 
                              : invoice.status === 'Overdue'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t">
                      <td colSpan={6} className="px-4 py-3 text-center text-sm text-muted-foreground">
                        No invoices found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Recent Payments</h2>
              <Button asChild>
                <Link href="/finance/payments">View All Payments</Link>
              </Button>
            </div>
            
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Reference #</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Payment Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Payment Method</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.latestPayments?.length > 0 ? (
                    data.latestPayments.map((payment: any) => (
                      <tr key={payment.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 text-left text-sm">
                          <Link href={`/finance/payments/${payment.id}`} className="text-primary hover:underline">
                            {payment.referenceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-left text-sm">{formatDate(new Date(payment.paymentDate))}</td>
                        <td className="px-4 py-3 text-left text-sm">{payment.paymentMethod}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{formatRupees(payment.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/finance/payments/${payment.id}`}>View Details</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t">
                      <td colSpan={5} className="px-4 py-3 text-center text-sm text-muted-foreground">
                        No payments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}