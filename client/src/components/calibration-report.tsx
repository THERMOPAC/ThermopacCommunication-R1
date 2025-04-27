import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Download, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, isAfter } from 'date-fns';

// Add the missing method to the jsPDF prototype
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

type CalibrationInstrument = {
  id: number;
  instrument_id: string;
  instrument_name: string;
  instrument_type: string;
  manufacturer: string;
  serial_number: string;
  location: string;
  calibration_frequency: string;
  last_calibration_date: string;
  next_calibration_date: string;
  status: string;
  remarks?: string;
  certificate_file_path?: string;
  certificate_url?: string;
  created_at: string;
  updated_at: string;
  created_by: number;
  created_by_user: string;
};

interface CalibrationReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CalibrationReport({ open, onOpenChange }: CalibrationReportProps) {
  const { toast } = useToast();
  const [instrumentIdFilter, setInstrumentIdFilter] = useState<string>('');
  const [instrumentTypeFilter, setInstrumentTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dueWithinFilter, setDueWithinFilter] = useState<string>('');
  const [reportData, setReportData] = useState<CalibrationInstrument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isReportGenerated, setIsReportGenerated] = useState<boolean>(false);

  // Instrument type options
  const instrumentTypeOptions = [
    "Welding Machine",
    "Micrometer",
    "Vernier Caliper",
    "Torque Wrench",
    "Coating Thickness Gauge",
    "Level / Spirit Level",
    "Pressure Gauge"
  ];

  // Status options
  const statusOptions = [
    "Active",
    "Due for Calibration",
    "Overdue",
    "In Calibration",
    "Out of Service"
  ];

  // Due within options
  const dueWithinOptions = [
    { label: "Next 7 days", value: "7" },
    { label: "Next 30 days", value: "30" },
    { label: "Next 90 days", value: "90" },
    { label: "All instruments", value: "all" }
  ];

  // Function to generate report
  const handleGenerateReport = async () => {
    setIsLoading(true);
    try {
      // Build the query string for filters
      let queryParams = new URLSearchParams();
      if (instrumentIdFilter) queryParams.append('instrumentId', instrumentIdFilter);
      if (instrumentTypeFilter && instrumentTypeFilter !== 'all_types') queryParams.append('instrumentType', instrumentTypeFilter);
      if (statusFilter && statusFilter !== 'all_statuses') queryParams.append('status', statusFilter);
      if (dueWithinFilter && dueWithinFilter !== 'all') queryParams.append('dueWithin', dueWithinFilter);

      const response = await fetch('/api/quality/calibration/report?' + queryParams.toString());
      
      if (!response.ok) {
        throw new Error('Failed to fetch report data');
      }
      
      const data = await response.json();
      setReportData(data);
      setIsReportGenerated(true);
      
      toast({
        title: 'Report Generated',
        description: `Found ${data.length} calibration instrument(s)`,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Function to get status badge
  const getStatusBadge = (status: string, nextCalibrationDate: string) => {
    const today = new Date();
    const nextDate = new Date(nextCalibrationDate);
    
    // Automatically determine if instrument is due/overdue based on date
    if (status === 'Active') {
      if (isAfter(today, nextDate)) {
        status = 'Overdue';
      } else if (isAfter(addDays(today, 30), nextDate)) {
        status = 'Due for Calibration';
      }
    }

    switch (status) {
      case 'Active':
        return <Badge className="bg-green-500">{status}</Badge>;
      case 'Due for Calibration':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">{status}</Badge>;
      case 'Overdue':
        return <Badge variant="destructive">{status}</Badge>;
      case 'In Calibration':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">{status}</Badge>;
      case 'Out of Service':
        return <Badge variant="outline" className="bg-slate-200 text-slate-800 border-slate-300">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Function to format date
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'dd-MM-yyyy');
    } catch (error) {
      return dateString;
    }
  };

  // Function to calculate days until next calibration
  const getDaysUntilCalibration = (nextCalibrationDate: string) => {
    if (!nextCalibrationDate) return null;
    
    const today = new Date();
    const nextDate = new Date(nextCalibrationDate);
    
    // Calculate the difference in milliseconds
    const diffTime = nextDate.getTime() - today.getTime();
    
    // Convert to days and round
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  // Function to generate PDF
  const handleExportPdf = () => {
    setIsGeneratingPdf(true);
    
    try {
      // Create new PDF document
      const doc = new jsPDF();
      
      // Add title and date
      doc.setFontSize(18);
      doc.text('Calibration Instruments Report', 105, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Generated on: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 105, 22, { align: 'center' });
      
      // Add filters if applied
      if (instrumentIdFilter || 
          (instrumentTypeFilter && instrumentTypeFilter !== 'all_types') || 
          (statusFilter && statusFilter !== 'all_statuses') || 
          (dueWithinFilter && dueWithinFilter !== 'all')) {
        doc.setFontSize(10);
        let filterText = 'Filters applied: ';
        if (instrumentIdFilter) filterText += `Instrument ID: ${instrumentIdFilter} `;
        if (instrumentTypeFilter && instrumentTypeFilter !== 'all_types') filterText += `Type: ${instrumentTypeFilter} `;
        if (statusFilter && statusFilter !== 'all_statuses') filterText += `Status: ${statusFilter} `;
        if (dueWithinFilter && dueWithinFilter !== 'all') filterText += `Due within: ${dueWithinFilter} days `;
        doc.text(filterText, 105, 28, { align: 'center' });
      }

      // Define table headers
      const headers = [
        { header: 'ID', dataKey: 'instrument_id' },
        { header: 'Name', dataKey: 'instrument_name' },
        { header: 'Type', dataKey: 'instrument_type' },
        { header: 'Location', dataKey: 'location' },
        { header: 'Last Calibration', dataKey: 'last_calibration_date' },
        { header: 'Next Calibration', dataKey: 'next_calibration_date' },
        { header: 'Days Left', dataKey: 'days_left' },
        { header: 'Status', dataKey: 'status' }
      ];

      // Create table body data
      const tableBody = reportData.map(instrument => {
        const daysLeft = getDaysUntilCalibration(instrument.next_calibration_date);
        
        return {
          instrument_id: instrument.instrument_id,
          instrument_name: instrument.instrument_name,
          instrument_type: instrument.instrument_type,
          location: instrument.location,
          last_calibration_date: formatDate(instrument.last_calibration_date),
          next_calibration_date: formatDate(instrument.next_calibration_date),
          days_left: daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days`) : 'N/A',
          status: instrument.status
        };
      });
      
      // Generate the table
      doc.autoTable({
        startY: 35,
        head: [headers.map(h => h.header)],
        body: tableBody.map(row => 
          headers.map(h => row[h.dataKey as keyof typeof row])
        ),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 25 }, // ID
          1: { cellWidth: 30 }, // Name
          2: { cellWidth: 25 }, // Type
          3: { cellWidth: 25 }, // Location
          4: { cellWidth: 25 }, // Last Cal
          5: { cellWidth: 25 }, // Next Cal
          6: { cellWidth: 25 }, // Days Left
          7: { cellWidth: 30 }, // Status
        },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 10, right: 10 },
      });
      
      // Save the PDF
      doc.save('Calibration_Instruments_Report.pdf');

      toast({
        title: 'PDF Generated',
        description: 'The calibration instruments report has been successfully exported to PDF',
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: 'PDF Export Failed',
        description: error instanceof Error ? error.message : 'Error creating PDF document',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibration Instruments Report</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instrumentId">Instrument ID (Optional)</Label>
              <Input 
                id="instrumentId" 
                placeholder="e.g. INST-00001" 
                value={instrumentIdFilter}
                onChange={(e) => setInstrumentIdFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instrumentType">Instrument Type (Optional)</Label>
              <Select 
                value={instrumentTypeFilter} 
                onValueChange={setInstrumentTypeFilter}
              >
                <SelectTrigger id="instrumentType">
                  <SelectValue placeholder="Select instrument type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_types">All Types</SelectItem>
                  {instrumentTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status (Optional)</Label>
              <Select 
                value={statusFilter} 
                onValueChange={setStatusFilter}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_statuses">All Statuses</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueWithin">Due Within (Optional)</Label>
              <Select 
                value={dueWithinFilter} 
                onValueChange={setDueWithinFilter}
              >
                <SelectTrigger id="dueWithin">
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  {dueWithinOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Generate Report Button */}
          <div className="flex justify-center">
            <Button onClick={handleGenerateReport} disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Report...</>
              ) : (
                <><FileText className="mr-2 h-4 w-4" /> Generate Report</>
              )}
            </Button>
          </div>

          {/* Report Content */}
          {isReportGenerated && reportData.length > 0 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Report Results ({reportData.length} instrument{reportData.length !== 1 ? 's' : ''})</h3>
                <Button onClick={handleExportPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</>
                  ) : (
                    <><Download className="mr-2 h-4 w-4" /> Export to PDF</>
                  )}
                </Button>
              </div>
              
              {/* Report Preview */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Calibration</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Calibration</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.map((instrument) => {
                      const daysLeft = getDaysUntilCalibration(instrument.next_calibration_date);
                      return (
                        <tr key={instrument.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{instrument.instrument_id}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{instrument.instrument_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{instrument.instrument_type}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{instrument.location}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(instrument.last_calibration_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center">
                              <span>{formatDate(instrument.next_calibration_date)}</span>
                              {daysLeft !== null && (
                                <span className="ml-2 text-xs inline-block">
                                  {daysLeft < 0 ? (
                                    <span className="text-red-600">({Math.abs(daysLeft)} days overdue)</span>
                                  ) : daysLeft <= 30 ? (
                                    <span className="text-amber-600">({daysLeft} days left)</span>
                                  ) : (
                                    <span className="text-gray-500">({daysLeft} days left)</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {getStatusBadge(instrument.status, instrument.next_calibration_date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {isReportGenerated && reportData.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No calibration instruments found matching the filter criteria.</p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}