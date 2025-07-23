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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatRupees, formatUSD, cn } from "@/lib/utils";
import { format } from "date-fns";
import { Loader2, Download, Filter, FileSpreadsheet, CalendarIcon } from "lucide-react";
import * as XLSX from 'xlsx';

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
  
  // Download dialog state
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [downloadType, setDownloadType] = useState<'dateRange' | 'financialYear'>('financialYear');
  const [downloadDateRange, setDownloadDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [downloadFinancialYear, setDownloadFinancialYear] = useState<string>('current');
  
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
  
  const handleDownload = async () => {
    try {
      let startDate: string, endDate: string, reportTitle: string;
      
      if (downloadType === 'financialYear') {
        const fyData = financialYearPresets.find(fy => fy.value === downloadFinancialYear);
        if (!fyData?.dateRange.from || !fyData?.dateRange.to) {
          alert('Please select a valid financial year');
          return;
        }
        startDate = format(fyData.dateRange.from, 'yyyy-MM-dd');
        endDate = format(fyData.dateRange.to, 'yyyy-MM-dd');
        reportTitle = `Turnover Report - ${fyData.label}`;
      } else {
        if (!downloadDateRange.from || !downloadDateRange.to) {
          alert('Please select both start and end dates');
          return;
        }
        startDate = format(downloadDateRange.from, 'yyyy-MM-dd');
        endDate = format(downloadDateRange.to, 'yyyy-MM-dd');
        reportTitle = `Turnover Report - ${format(downloadDateRange.from, 'MMM dd, yyyy')} to ${format(downloadDateRange.to, 'MMM dd, yyyy')}`;
      }
      
      // Fetch data for the selected date range
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      if (selectedCurrency !== 'all') params.append('currency', selectedCurrency);
      
      const response = await fetch(`/api/finance/reports/turnover-direct?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch turnover data');
      }
      
      const reportData = await response.json();
      
      // Use the same date range for detailed invoice data as selected by user
      const detailResponse = await fetch(`/api/simple-finance/invoices?startDate=${startDate}&endDate=${endDate}${selectedCurrency !== 'all' ? `&currency=${selectedCurrency}` : ''}`);
      const invoiceDetails = detailResponse.ok ? await detailResponse.json() : [];
      
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();
      
      // Summary Sheet with Credit Notes Integration
      const summaryData = [
        ['THERMOPAC TURNOVER REPORT'],
        [`Report Period: ${downloadType === 'financialYear' ? financialYearPresets.find(fy => fy.value === downloadFinancialYear)?.label : format(downloadDateRange.from!, 'MMM dd, yyyy') + ' to ' + format(downloadDateRange.to!, 'MMM dd, yyyy')}`],
        [`Generated on: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`],
        [''],
        ['SUMMARY'],
        ['Metric', 'USD Amount', 'INR Amount'],
        ['Total Invoiced (Net)', reportData.totalInvoiced?.toFixed(2) || '0.00', reportData.totalInvoicedINR?.toFixed(2) || '0.00'],
        ['Total Credit Notes', reportData.totalCreditNotes?.toFixed(2) || '0.00', reportData.totalCreditNotesINR?.toFixed(2) || '0.00'],
        ['Total Received', reportData.totalReceived?.toFixed(2) || '0.00', reportData.totalReceivedINR?.toFixed(2) || '0.00'],
        ['Total Outstanding', reportData.totalOutstanding?.toFixed(2) || '0.00', reportData.totalOutstandingINR?.toFixed(2) || '0.00'],
        [''],
        ['Collection Rate', `${reportData.totalInvoiced > 0 ? ((reportData.totalReceived / reportData.totalInvoiced) * 100).toFixed(2) : '0.00'}%`],
        ['Credit Note Rate', `${reportData.totalInvoiced > 0 && reportData.totalCreditNotes ? ((reportData.totalCreditNotes / (reportData.totalInvoiced + reportData.totalCreditNotes)) * 100).toFixed(2) : '0.00'}%`]
      ];
      
      const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Set column widths
      summaryWorksheet['!cols'] = [
        { width: 20 },
        { width: 15 },
        { width: 18 }
      ];
      
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      
      // Detailed Invoice Sheet
      if (invoiceDetails && invoiceDetails.length > 0) {
        // Fetch invoice items for each invoice
        const detailedInvoiceData = [];
        const headers = [
          'Invoice Number',
          'Currency', 
          'Exchange Rate',
          'SAP Invoice No',
          'Invoice Type',
          'Shipping Bill No',
          'Customer',
          'Project',
          'Issue Date',
          'Due Date',
          'Notes',
          'Description',
          'Amount',
          'Amount LC'
        ];
        
        detailedInvoiceData.push(['DETAILED INVOICE DATA']);
        detailedInvoiceData.push([]);
        detailedInvoiceData.push(headers);
        
        // Sort invoices by Invoice Number in ascending order
        const sortedInvoices = [...invoiceDetails].sort((a, b) => {
          const invoiceA = (a.invoiceNumber || '').toString();
          const invoiceB = (b.invoiceNumber || '').toString();
          return invoiceA.localeCompare(invoiceB, undefined, { numeric: true });
        });

        for (const invoice of sortedInvoices) {
          try {
            // Fetch invoice items for each invoice
            const itemsResponse = await fetch(`/api/simple-finance/invoice-items/${invoice.id}`);
            const items = itemsResponse.ok ? await itemsResponse.json() : [];
            
            if (items.length > 0) {
              // Add row for each invoice item
              items.forEach((item: any) => {
                detailedInvoiceData.push([
                  invoice.invoiceNumber || '',
                  invoice.currency || '',
                  parseFloat(invoice.exchangeRate) || 0, // Convert to number for formatting
                  invoice.sapInvoiceNo || '',
                  invoice.invoiceType || '',
                  invoice.shippingBillNumber || '',
                  invoice.customerName || '',
                  invoice.projectName || '',
                  invoice.issueDate ? format(new Date(invoice.issueDate), 'yyyy-MM-dd') : '',
                  invoice.dueDate ? format(new Date(invoice.dueDate), 'yyyy-MM-dd') : '',
                  invoice.notes || '',
                  item.description || '',
                  parseFloat(item.amount) || 0, // Convert to number for formatting
                  parseFloat(item.amountLC) || 0 // Convert to number for formatting
                ]);
              });
            } else {
              // Add row for invoice without items
              detailedInvoiceData.push([
                invoice.invoiceNumber || '',
                invoice.currency || '',
                parseFloat(invoice.exchangeRate) || 0, // Convert to number for formatting
                invoice.sapInvoiceNo || '',
                invoice.invoiceType || '',
                invoice.shippingBillNumber || '',
                invoice.customerName || '',
                invoice.projectName || '',
                invoice.issueDate ? format(new Date(invoice.issueDate), 'yyyy-MM-dd') : '',
                invoice.dueDate ? format(new Date(invoice.dueDate), 'yyyy-MM-dd') : '',
                invoice.notes || '',
                'No item details available',
                parseFloat(invoice.totalAmount) || 0, // Convert to number for formatting
                0 // Amount LC not available for invoice-level data
              ]);
            }
          } catch (error) {
            console.error(`Error fetching items for invoice ${invoice.id}:`, error);
            // Add row for invoice with error
            detailedInvoiceData.push([
              invoice.invoiceNumber || '',
              invoice.currency || '',
              parseFloat(invoice.exchangeRate) || 0, // Convert to number for formatting
              invoice.sapInvoiceNo || '',
              invoice.invoiceType || '',
              invoice.shippingBillNumber || '',
              invoice.customerName || '',
              invoice.projectName || '',
              invoice.issueDate ? format(new Date(invoice.issueDate), 'yyyy-MM-dd') : '',
              invoice.dueDate ? format(new Date(invoice.dueDate), 'yyyy-MM-dd') : '',
              invoice.notes || '',
              'Error loading item details',
              parseFloat(invoice.totalAmount) || 0, // Convert to number for formatting
              0 // Amount LC not available for invoice-level data
            ]);
          }
        }
        
        // Calculate totals for Amount and Amount LC columns
        let totalAmount = 0;
        let totalAmountLC = 0;
        
        // Skip the header rows (first 3 rows) and sum the amount columns
        for (let i = 3; i < detailedInvoiceData.length; i++) {
          const row = detailedInvoiceData[i];
          if (row && row.length >= 14) {
            totalAmount += parseFloat(row[12]) || 0; // Amount column (index 12)
            totalAmountLC += parseFloat(row[13]) || 0; // Amount LC column (index 13)
          }
        }
        
        // Add totals row
        detailedInvoiceData.push([
          '', '', '', '', '', '', '', '', '', '', '',
          'TOTAL:', // Description column
          totalAmount, // Amount total
          totalAmountLC // Amount LC total
        ]);
        
        const detailedWorksheet = XLSX.utils.aoa_to_sheet(detailedInvoiceData);
        
        // Set column widths for detailed sheet
        detailedWorksheet['!cols'] = [
          { width: 18 }, // Invoice Number
          { width: 10 }, // Currency
          { width: 12 }, // Exchange Rate
          { width: 18 }, // SAP Invoice No
          { width: 15 }, // Invoice Type
          { width: 18 }, // Shipping Bill No
          { width: 20 }, // Customer
          { width: 15 }, // Project
          { width: 12 }, // Issue Date
          { width: 12 }, // Due Date
          { width: 25 }, // Notes
          { width: 30 }, // Description
          { width: 15 }, // Amount
          { width: 18 }  // Amount LC
        ];
        
        // Apply number formatting to specific columns
        const range = XLSX.utils.decode_range(detailedWorksheet['!ref'] || 'A1');
        
        // Format Exchange Rate column (column C, index 2)
        for (let row = 3; row <= range.e.r; row++) { // Start from row 3 (after headers)
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: 2 });
          if (detailedWorksheet[cellAddress] && typeof detailedWorksheet[cellAddress].v === 'number') {
            detailedWorksheet[cellAddress].z = '#,##0.0000'; // 4 decimal places for exchange rate
          }
        }
        
        // Format Amount column (column M, index 12)
        for (let row = 3; row <= range.e.r; row++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: 12 });
          if (detailedWorksheet[cellAddress] && typeof detailedWorksheet[cellAddress].v === 'number') {
            detailedWorksheet[cellAddress].z = '#,##0.00'; // 2 decimal places with comma separator
          }
        }
        
        // Format Amount LC column (column N, index 13)
        for (let row = 3; row <= range.e.r; row++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: 13 });
          if (detailedWorksheet[cellAddress] && typeof detailedWorksheet[cellAddress].v === 'number') {
            detailedWorksheet[cellAddress].z = '#,##0.00'; // 2 decimal places with comma separator
          }
        }
        
        XLSX.utils.book_append_sheet(workbook, detailedWorksheet, 'Invoice Details');
      }
      
      // Monthly Details Sheet with Credit Notes (if available)
      if (reportData.monthlyData && reportData.monthlyData.length > 0) {
        const monthlyHeader = [
          ['MONTHLY BREAKDOWN WITH CREDIT NOTES'],
          [''],
          ['Month', 'Invoiced (USD)', 'Credit Notes (USD)', 'Received (USD)', 'Outstanding (USD)', 'Collection %', 'Invoiced (INR)', 'Credit Notes (INR)', 'Received (INR)', 'Outstanding (INR)']
        ];
        
        const monthlyDetails = reportData.monthlyData.map((month: any) => [
          month.month,
          month.invoicedAmount?.toFixed(2) || '0.00',
          month.creditNotes?.toFixed(2) || '0.00',
          month.receivedAmount?.toFixed(2) || '0.00', 
          month.outstanding?.toFixed(2) || '0.00',
          `${month.percentCollected?.toFixed(2) || '0.00'}%`,
          month.invoicedAmountINR?.toFixed(2) || '0.00',
          month.creditNotesINR?.toFixed(2) || '0.00',
          month.receivedAmountINR?.toFixed(2) || '0.00',
          month.outstandingINR?.toFixed(2) || '0.00'
        ]);
        
        const monthlyData = [...monthlyHeader, ...monthlyDetails];
        const monthlyWorksheet = XLSX.utils.aoa_to_sheet(monthlyData);
        
        // Set column widths
        monthlyWorksheet['!cols'] = [
          { width: 15 }, // Month
          { width: 15 }, // Invoiced USD
          { width: 15 }, // Credit Notes USD
          { width: 15 }, // Received USD
          { width: 15 }, // Outstanding USD
          { width: 12 }, // Collection %
          { width: 18 }, // Invoiced INR
          { width: 15 }, // Credit Notes INR
          { width: 18 }, // Received INR
          { width: 18 }  // Outstanding INR
        ];
        
        XLSX.utils.book_append_sheet(workbook, monthlyWorksheet, 'Monthly Details');
      }
      
      // Generate and download file
      const fileName = `Turnover_Report_${downloadType === 'financialYear' ? downloadFinancialYear : format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      setIsDownloadDialogOpen(false);
      
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download report. Please try again.');
    }
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
          <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Download className="mr-2 h-4 w-4" />
                Download Turnover Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  Download Turnover Report
                </DialogTitle>
                <DialogDescription>
                  Select date range or financial year for the report
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Selection Type */}
                <RadioGroup value={downloadType} onValueChange={(value) => setDownloadType(value as 'dateRange' | 'financialYear')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="financialYear" id="fy" />
                    <Label htmlFor="fy">Financial Year</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dateRange" id="dateRange" />
                    <Label htmlFor="dateRange">Custom Date Range</Label>
                  </div>
                </RadioGroup>
                
                {/* Financial Year Selection */}
                {downloadType === 'financialYear' && (
                  <div className="space-y-2">
                    <Label>Select Financial Year</Label>
                    <Select value={downloadFinancialYear} onValueChange={setDownloadFinancialYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {financialYearPresets.filter(fy => fy.value !== 'custom').map((fy) => (
                          <SelectItem key={fy.value} value={fy.value}>
                            {fy.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Date Range Selection */}
                {downloadType === 'dateRange' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>From Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !downloadDateRange.from && "text-muted-foreground"
                            )}
                          >
                            {downloadDateRange.from ? (
                              format(downloadDateRange.from, "PPP")
                            ) : (
                              <span>Select start date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={downloadDateRange.from}
                            onSelect={(date) => setDownloadDateRange({ ...downloadDateRange, from: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>To Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !downloadDateRange.to && "text-muted-foreground"
                            )}
                          >
                            {downloadDateRange.to ? (
                              format(downloadDateRange.to, "PPP")
                            ) : (
                              <span>Select end date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={downloadDateRange.to}
                            onSelect={(date) => setDownloadDateRange({ ...downloadDateRange, to: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDownloadDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleDownload}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Excel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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