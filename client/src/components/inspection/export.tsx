import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarIcon, FileText, Download, Printer, Mail, Filter, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type ExportConfig = {
  format: 'pdf' | 'excel' | 'csv';
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  includeFields: string[];
  reportType: string;
  templateId?: string;
  filters: {
    status?: string;
    inspectionType?: string;
  };
}

export default function InspectionExport({ projectId }: { projectId: number | null }) {
  const { toast } = useToast();
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'pdf',
    dateRange: {
      from: undefined,
      to: undefined,
    },
    includeFields: [
      'inspectionOrderNumber', 
      'itemCode', 
      'description', 
      'quantity', 
      'status', 
      'inspectionType'
    ],
    reportType: 'inspection_summary',
    filters: {}
  });
  
  // Mutation for exporting reports
  const exportMutation = useMutation({
    mutationFn: async (config: ExportConfig) => {
      if (!projectId) throw new Error("Project ID is required");
      
      const response = await apiRequest('POST', `/api/quality/exports/project/${projectId}`, config);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate export");
      }
      
      // Check if we have a file download
      const contentType = response.headers.get('content-type');
      
      if (contentType && (contentType.includes('application/pdf') || 
          contentType.includes('application/vnd.ms-excel') || 
          contentType.includes('text/csv'))) {
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Get filename from Content-Disposition header or create a default one
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'inspection-report';
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        return { success: true, filename };
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Export Generated",
          description: `Your report has been ${data.filename ? 'downloaded' : 'generated'} successfully.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message || "There was an error generating your report. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const handleExport = () => {
    if (!projectId) {
      toast({
        title: "Export Failed",
        description: "Please select a project first",
        variant: "destructive",
      });
      return;
    }
    
    if (!exportConfig.reportType) {
      toast({
        title: "Export Failed",
        description: "Please select a report type",
        variant: "destructive",
      });
      return;
    }
    
    exportMutation.mutate(exportConfig);
  };
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Export Inspection Reports</CardTitle>
          <CardDescription>
            Generate detailed reports from inspection data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="standard" className="mb-4">
            <TabsList>
              <TabsTrigger value="standard">Standard Reports</TabsTrigger>
              <TabsTrigger value="custom">Custom Reports</TabsTrigger>
              <TabsTrigger value="templates">Report Templates</TabsTrigger>
            </TabsList>
            
            <TabsContent value="standard" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="report-type">Report Type</Label>
                  <Select 
                    value={exportConfig.reportType} 
                    onValueChange={(value) => setExportConfig({...exportConfig, reportType: value})}
                  >
                    <SelectTrigger id="report-type">
                      <SelectValue placeholder="Select report type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inspection_summary">Inspection Summary</SelectItem>
                      <SelectItem value="inspection_detail">Inspection Detailed Report</SelectItem>
                      <SelectItem value="ncr_summary">Non-Conformance Summary</SelectItem>
                      <SelectItem value="material_traceability">Material Traceability Report</SelectItem>
                      <SelectItem value="inspector_performance">Inspector Performance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="export-format">Export Format</Label>
                  <Select 
                    value={exportConfig.format} 
                    onValueChange={(value: 'pdf' | 'excel' | 'csv') => setExportConfig({...exportConfig, format: value})}
                  >
                    <SelectTrigger id="export-format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                      <SelectItem value="csv">CSV File</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="from-date">From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="from-date"
                          variant={"outline"}
                          className={cn(
                            "w-[240px] justify-start text-left font-normal",
                            !exportConfig.dateRange.from && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {exportConfig.dateRange.from ? (
                            format(exportConfig.dateRange.from, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={exportConfig.dateRange.from}
                          onSelect={(date) => setExportConfig({
                            ...exportConfig, 
                            dateRange: {...exportConfig.dateRange, from: date}
                          })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="to-date">To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="to-date"
                          variant={"outline"}
                          className={cn(
                            "w-[240px] justify-start text-left font-normal",
                            !exportConfig.dateRange.to && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {exportConfig.dateRange.to ? (
                            format(exportConfig.dateRange.to, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={exportConfig.dateRange.to}
                          onSelect={(date) => setExportConfig({
                            ...exportConfig, 
                            dateRange: {...exportConfig.dateRange, to: date}
                          })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Filters</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select 
                      value={exportConfig.filters.status} 
                      onValueChange={(value) => setExportConfig({
                        ...exportConfig, 
                        filters: {...exportConfig.filters, status: value}
                      })}
                    >
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="type-filter">Inspection Type</Label>
                    <Select 
                      value={exportConfig.filters.inspectionType} 
                      onValueChange={(value) => setExportConfig({
                        ...exportConfig, 
                        filters: {...exportConfig.filters, inspectionType: value}
                      })}
                    >
                      <SelectTrigger id="type-filter">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="make">Make Items</SelectItem>
                        <SelectItem value="buy">Buy Items</SelectItem>
                        <SelectItem value="component">Component Items</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Include Fields</Label>
                <div className="border rounded-md p-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-order-number" 
                      checked={exportConfig.includeFields.includes('inspectionOrderNumber')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'inspectionOrderNumber']
                          : exportConfig.includeFields.filter(f => f !== 'inspectionOrderNumber');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-order-number">Order Number</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-item-code" 
                      checked={exportConfig.includeFields.includes('itemCode')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'itemCode']
                          : exportConfig.includeFields.filter(f => f !== 'itemCode');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-item-code">Item Code</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-description" 
                      checked={exportConfig.includeFields.includes('description')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'description']
                          : exportConfig.includeFields.filter(f => f !== 'description');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-description">Description</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-quantity" 
                      checked={exportConfig.includeFields.includes('quantity')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'quantity']
                          : exportConfig.includeFields.filter(f => f !== 'quantity');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-quantity">Quantity</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-status" 
                      checked={exportConfig.includeFields.includes('status')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'status']
                          : exportConfig.includeFields.filter(f => f !== 'status');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-status">Status</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-inspection-type" 
                      checked={exportConfig.includeFields.includes('inspectionType')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'inspectionType']
                          : exportConfig.includeFields.filter(f => f !== 'inspectionType');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-inspection-type">Inspection Type</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-drawing-no" 
                      checked={exportConfig.includeFields.includes('drawingNo')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'drawingNo']
                          : exportConfig.includeFields.filter(f => f !== 'drawingNo');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-drawing-no">Drawing Number</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-created-at" 
                      checked={exportConfig.includeFields.includes('createdAt')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'createdAt']
                          : exportConfig.includeFields.filter(f => f !== 'createdAt');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-created-at">Creation Date</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="field-inspector" 
                      checked={exportConfig.includeFields.includes('inspector')}
                      onCheckedChange={(checked) => {
                        const newFields = checked 
                          ? [...exportConfig.includeFields, 'inspector']
                          : exportConfig.includeFields.filter(f => f !== 'inspector');
                        setExportConfig({...exportConfig, includeFields: newFields});
                      }}
                    />
                    <Label htmlFor="field-inspector">Inspector</Label>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="custom" className="space-y-4 mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                <h3 className="text-lg font-medium mb-2">Custom Reports Coming Soon</h3>
                <p>Custom report builder functionality will be available in a future update.</p>
              </div>
            </TabsContent>
            
            <TabsContent value="templates" className="space-y-4 mt-4">
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 text-muted-foreground/80" />
                <h3 className="text-lg font-medium mb-2">Report Templates Coming Soon</h3>
                <p>Save and load report templates in a future update.</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Preview
            </Button>
            <Button 
              onClick={handleExport}
              disabled={exportMutation.isPending || !projectId}
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}