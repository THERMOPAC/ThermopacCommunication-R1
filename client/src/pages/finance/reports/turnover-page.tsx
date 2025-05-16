import { useState } from 'react';
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
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { formatRupees, formatDate } from "@/lib/utils";
import { Loader2, Download, Filter } from "lucide-react";

export default function TurnoverReportPage() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1), // Start of 3 months ago
    to: new Date()
  });
  
  const [selectedCurrency, setSelectedCurrency] = useState<string>("all");
  
  // Query for turnover report data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/finance/reports/turnover', dateRange, selectedCurrency],
    queryFn: async () => {
      const startDate = dateRange.from ? formatDate(dateRange.from, 'yyyy-MM-dd') : '';
      const endDate = dateRange.to ? formatDate(dateRange.to, 'yyyy-MM-dd') : '';
      const currencyParam = selectedCurrency !== 'all' ? `&currency=${selectedCurrency}` : '';
      
      const response = await fetch(`/api/finance/reports/turnover?startDate=${startDate}&endDate=${endDate}${currencyParam}`);
      if (!response.ok) {
        throw new Error('Failed to fetch turnover report');
      }
      return response.json();
    },
    enabled: !!(dateRange.from && dateRange.to)
  });
  
  const handleDownload = () => {
    // Placeholder for download functionality
    alert('Download functionality will be implemented in a future update.');
  };
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="mr-2 h-16 w-16 animate-spin" />
          <p>Loading Turnover Report...</p>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <Helmet>
        <title>Turnover Report | Thermopac Finance</title>
      </Helmet>
      
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Turnover Report</h1>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Report Filters</CardTitle>
            <CardDescription>
              Filter the turnover report by date range and currency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <div className="flex gap-2">
                  <DatePicker
                    value={dateRange}
                    onChange={(date) => {
                      setDateRange(date);
                      if (date.from && date.to) {
                        refetch();
                      }
                    }}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <Select value={selectedCurrency} onValueChange={(value) => {
                  setSelectedCurrency(value);
                  refetch();
                }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Turnover Summary</CardTitle>
            <CardDescription>
              {dateRange.from && dateRange.to
                ? `${formatDate(dateRange.from)} to ${formatDate(dateRange.to)}`
                : "Select a date range to view the report"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <Card>
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">Total Invoiced</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-right">
                        {formatRupees(data.totalInvoiced || 0)}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">Total Received</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-right">
                        {formatRupees(data.totalReceived || 0)}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">Outstanding Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-right">
                        {formatRupees(data.totalOutstanding || 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Invoiced Amount</TableHead>
                      <TableHead>Received Amount</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead className="text-right">Percent Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthlyData && data.monthlyData.length > 0 ? (
                      data.monthlyData.map((month: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{month.month}</TableCell>
                          <TableCell>{formatRupees(month.invoiced)}</TableCell>
                          <TableCell>{formatRupees(month.received)}</TableCell>
                          <TableCell>{formatRupees(month.outstanding)}</TableCell>
                          <TableCell className="text-right">
                            {month.invoiced > 0 
                              ? `${Math.round((month.received / month.invoiced) * 100)}%` 
                              : '0%'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          No turnover data available for the selected period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Select a date range and currency to view the turnover report.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}