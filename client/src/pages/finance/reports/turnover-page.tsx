import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from "react-helmet";
import { DateRange } from "react-day-picker";
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
import { formatRupees, formatUSD } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Download, Filter } from "lucide-react";

export default function TurnoverReportPage() {
  // Helper function to get current financial year dates (April 1 - March 31) using Indian Financial Year
  const getCurrentFinancialYearDates = (): DateRange => {
    const today = new Date();
    const currentMonth = today.getMonth(); // 0-based (0 = January)
    const currentYear = today.getFullYear();
    
    // Indian Financial Year: April 1 to March 31
    // If current month is Jan-Mar (0-2), we're in the FY that started previous year
    // If current month is Apr-Dec (3-11), we're in the FY that started this year
    let financialYearStart: Date;
    let financialYearEnd: Date;
    
    if (currentMonth >= 3) { // April onwards (month 3 = April)
      financialYearStart = new Date(currentYear, 3, 1); // April 1st current year
      financialYearEnd = new Date(currentYear + 1, 2, 31); // March 31st next year
    } else { // January to March
      financialYearStart = new Date(currentYear - 1, 3, 1); // April 1st previous year
      financialYearEnd = new Date(currentYear, 2, 31); // March 31st current year
    }
    
    console.log('Financial Year calculation:', {
      today: today.toDateString(),
      currentMonth,
      currentYear,
      financialYearStart: financialYearStart.toDateString(),
      financialYearEnd: financialYearEnd.toDateString()
    });
    
    return { from: financialYearStart, to: financialYearEnd };
  };
  
  // Helper function to get previous financial year dates
  const getPreviousFinancialYearDates = (): DateRange => {
    const current = getCurrentFinancialYearDates();
    if (current.from && current.to) {
      const prevStart = new Date(current.from.getFullYear() - 1, current.from.getMonth(), current.from.getDate());
      const prevEnd = new Date(current.to.getFullYear() - 1, current.to.getMonth(), current.to.getDate());
      return { from: prevStart, to: prevEnd };
    }
    return { from: undefined, to: undefined };
  };
  
  // Initialize with current financial year
  const [dateRange, setDateRange] = useState<DateRange>(
    getCurrentFinancialYearDates()
  );
  
  // Financial year preset options
  const [selectedPreset, setSelectedPreset] = useState<string>("current");
  
  const financialYearPresets = [
    { 
      label: 'Current FY (2025-26)', 
      value: 'current',
      dateRange: getCurrentFinancialYearDates()
    },
    { 
      label: 'Previous FY (2024-25)', 
      value: 'previous',
      dateRange: getPreviousFinancialYearDates()
    },
    { 
      label: 'Last 3 Months', 
      value: 'last3months',
      dateRange: {
        from: new Date(new Date().setMonth(new Date().getMonth() - 3)),
        to: new Date()
      }
    },
    { 
      label: 'Custom', 
      value: 'custom',
      dateRange: { from: undefined, to: undefined }
    }
  ];
  
  const [selectedCurrency, setSelectedCurrency] = useState<string>("all");
  
  // Query for turnover report data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/finance/reports/turnover', dateRange, selectedCurrency],
    queryFn: async () => {
      // Get date range for filtering
      const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
      const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
      
      console.log('Turnover Report API call - Date range:', {
        from: startDate,
        to: endDate,
        dateRangeFrom: dateRange.from?.toDateString(),
        dateRangeTo: dateRange.to?.toDateString()
      });
      
      // Build query parameters
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedCurrency !== 'all') params.append('currency', selectedCurrency);
      
      const response = await fetch(`/api/finance/reports/turnover-direct?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch turnover report');
      }
      
      const data = await response.json();
      console.log('💥 FRONTEND - Turnover report data received:', data);
      console.log('💥 FRONTEND - Response status:', response.status);
      console.log('💥 FRONTEND - Response type:', typeof data);
      console.log('💥 FRONTEND - Data keys:', Object.keys(data || {}));
      return data;
    },
    enabled: true
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
                <label className="text-sm font-medium">Financial Year</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Select 
                    value={selectedPreset} 
                    onValueChange={(value) => {
                      setSelectedPreset(value);
                      const preset = financialYearPresets.find(p => p.value === value);
                      
                      if (preset && preset.dateRange) {
                        setDateRange(preset.dateRange);
                        refetch();
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {financialYearPresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <DatePicker
                    value={dateRange}
                    onChange={(date) => {
                      if (date) {
                        setDateRange(date);
                        setSelectedPreset('custom'); // Switch to custom when manually selected
                        if (date.from && date.to) {
                          refetch();
                        }
                      }
                    }}
                  />
                </div>
                
                {selectedPreset !== 'custom' && (
                  <div className="text-xs text-muted-foreground">
                    {selectedPreset === 'current' && 'Current financial year (Apr 1 - Mar 31)'}
                    {selectedPreset === 'previous' && 'Previous financial year (Apr 1 - Mar 31)'}
                    {selectedPreset === 'last3months' && 'Last 3 months'}
                  </div>
                )}
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
                ? `${format(dateRange.from, 'MMM dd, yyyy')} to ${format(dateRange.to, 'MMM dd, yyyy')}`
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
                      {selectedCurrency === 'USD' || selectedCurrency === 'all' ? (
                        <p className="text-2xl font-bold text-right">
                          {formatUSD(data.totalInvoiced || 0)}
                        </p>
                      ) : (
                        <p className="text-2xl font-bold text-right">
                          {formatRupees(data.totalInvoiced || 0)}
                        </p>
                      )}
                      {selectedCurrency === 'all' && (
                        <p className="text-sm text-muted-foreground text-right mt-1">
                          ~ {formatRupees(data.totalInvoicedINR || data.totalInvoiced * 85.55 || 0, true)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">Total Received</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedCurrency === 'USD' || selectedCurrency === 'all' ? (
                        <p className="text-2xl font-bold text-right">
                          {formatUSD(data.totalReceived || 0)}
                        </p>
                      ) : (
                        <p className="text-2xl font-bold text-right">
                          {formatRupees(data.totalReceived || 0)}
                        </p>
                      )}
                      {selectedCurrency === 'all' && (
                        <p className="text-sm text-muted-foreground text-right mt-1">
                          ~ {formatRupees(data.totalReceivedINR || data.totalReceived * 85.55 || 0, true)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="py-4">
                      <CardTitle className="text-base">Outstanding Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedCurrency === 'USD' || selectedCurrency === 'all' ? (
                        <p className="text-2xl font-bold text-right">
                          {formatUSD(data.totalOutstanding || 0)}
                        </p>
                      ) : (
                        <p className="text-2xl font-bold text-right">
                          {formatRupees(data.totalOutstanding || 0)}
                        </p>
                      )}
                      {selectedCurrency === 'all' && (
                        <p className="text-sm text-muted-foreground text-right mt-1">
                          ~ {formatRupees(data.totalOutstandingINR || data.totalOutstanding * 85.55 || 0, true)}
                        </p>
                      )}
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
                    {data && data.monthlyData && data.monthlyData.length > 0 ? (
                      data.monthlyData.map((month: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{month.month}</TableCell>
                          <TableCell>
                            {selectedCurrency === 'USD' || selectedCurrency === 'all' ? 
                              formatUSD(month.invoicedAmount) : 
                              formatRupees(month.invoicedAmountINR || month.invoicedAmount * 85.55)
                            }
                          </TableCell>
                          <TableCell>
                            {selectedCurrency === 'USD' || selectedCurrency === 'all' ? 
                              formatUSD(month.receivedAmount) : 
                              formatRupees(month.receivedAmountINR || month.receivedAmount * 85.55)
                            }
                          </TableCell>
                          <TableCell>
                            {selectedCurrency === 'USD' || selectedCurrency === 'all' ? 
                              formatUSD(month.outstanding) : 
                              formatRupees(month.outstandingINR || month.outstanding * 85.55)
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold">{month.percentCollected}%</span>
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