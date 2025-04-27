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
import { Loader2, FileText, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Add the missing method to the jsPDF prototype
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

type WpsReportData = {
  wps_id: number;
  wps_number: string;
  pqr_number: string;
  revision_no: string;
  welder_process: string;
  base_metal_grade: string;
  base_metal_thickness: string;
  filler_material: string;
  joint_type: string;
  weld_position: string;
  preheating_temp?: string;
  post_weld_heat_treatment?: string;
  shielding_gas?: string;
  wps_status: string;
  wps_remarks?: string;
  wps_created_at: string;
  wps_updated_at: string;
  wps_approved_by?: number;
  wps_approval_date?: string;
  wps_created_by_user: string;
  wps_approved_by_user?: string;
  has_pqr?: boolean;
  pqr_test_date?: string;
  pqr_test_laboratory?: string;
  pqr_test_type?: string;
  pqr_test_results?: string;
  pqr_status?: string;
  pqr_remarks?: string;
};

interface WpsPqrReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WpsPqrReport({ open, onOpenChange }: WpsPqrReportProps) {
  const { toast } = useToast();
  const [wpsIdFilter, setWpsIdFilter] = useState<string>('');
  const [pqrIdFilter, setPqrIdFilter] = useState<string>('');
  const [reportData, setReportData] = useState<WpsReportData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isReportGenerated, setIsReportGenerated] = useState<boolean>(false);

  // Function to generate report
  const handleGenerateReport = async () => {
    setIsLoading(true);
    try {
      // Build the query string for filters
      let queryParams = new URLSearchParams();
      if (wpsIdFilter) queryParams.append('wpsId', wpsIdFilter);
      if (pqrIdFilter) queryParams.append('pqrId', pqrIdFilter);

      const response = await fetch('/api/quality/report?' + queryParams.toString());
      
      if (!response.ok) {
        throw new Error('Failed to fetch report data');
      }
      
      const data = await response.json();
      setReportData(data);
      setIsReportGenerated(true);
      
      toast({
        title: 'Report Generated',
        description: `Found ${data.length} WPS document(s)`,
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

  // Function to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Function to generate PDF
  const handleExportPdf = () => {
    setIsGeneratingPdf(true);
    
    try {
      // Create new PDF document
      const doc = new jsPDF();
      
      // Add title and date
      doc.setFontSize(18);
      doc.text('WPS & PQR Report', 105, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 22, { align: 'center' });
      
      // Add filters if applied
      if (wpsIdFilter || pqrIdFilter) {
        doc.setFontSize(10);
        let filterText = 'Filters applied: ';
        if (wpsIdFilter) filterText += `WPS ID: ${wpsIdFilter} `;
        if (pqrIdFilter) filterText += `PQR ID: ${pqrIdFilter}`;
        doc.text(filterText, 105, 28, { align: 'center' });
      }

      let yPos = 35;
      const pageWidth = doc.internal.pageSize.width;
      
      // Process each WPS document
      reportData.forEach((wps, index) => {
        // Check if we need to add a new page
        if (index > 0) {
          doc.addPage();
          yPos = 15;
        }
        
        // WPS Section Title
        doc.setFontSize(14);
        doc.setTextColor(0, 102, 204);
        doc.text(`WPS Document: ${wps.wps_number}`, 14, yPos);
        yPos += 8;
        
        // WPS Details
        const wpsData = [
          ['WPS Number', wps.wps_number],
          ['Revision', wps.revision_no],
          ['Welding Process', wps.welder_process],
          ['Base Metal Grade', wps.base_metal_grade],
          ['Base Metal Thickness', wps.base_metal_thickness],
          ['Filler Material', wps.filler_material],
          ['Joint Type', wps.joint_type],
          ['Weld Position', wps.weld_position],
          ['Preheating Temperature', wps.preheating_temp || 'N/A'],
          ['Post Weld Heat Treatment', wps.post_weld_heat_treatment || 'N/A'],
          ['Shielding Gas', wps.shielding_gas || 'N/A'],
          ['Status', wps.wps_status],
          ['Created By', wps.wps_created_by_user],
          ['Created Date', formatDate(wps.wps_created_at)],
          ['Approved By', wps.wps_approved_by_user || 'N/A'],
          ['Approval Date', wps.wps_approval_date ? formatDate(wps.wps_approval_date) : 'N/A'],
          ['Remarks', wps.wps_remarks || 'N/A'],
        ];
        
        doc.autoTable({
          startY: yPos,
          head: [['Parameter', 'Value']],
          body: wpsData,
          theme: 'striped',
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          margin: { left: 14, right: 14 },
          tableWidth: pageWidth - 28,
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 10;
        
        // PQR Section if available
        if (wps.has_pqr) {
          doc.setFontSize(14);
          doc.setTextColor(0, 102, 204);
          doc.text(`PQR Document: ${wps.pqr_number}`, 14, yPos);
          yPos += 8;
          
          const pqrData = [
            ['PQR Number', wps.pqr_number],
            ['Test Date', wps.pqr_test_date ? formatDate(wps.pqr_test_date) : 'N/A'],
            ['Test Laboratory', wps.pqr_test_laboratory || 'N/A'],
            ['Test Type', wps.pqr_test_type || 'N/A'],
            ['Test Results', wps.pqr_test_results || 'N/A'],
            ['Status', wps.pqr_status || 'N/A'],
            ['Remarks', wps.pqr_remarks || 'N/A'],
          ];
          
          doc.autoTable({
            startY: yPos,
            head: [['Parameter', 'Value']],
            body: pqrData,
            theme: 'striped',
            headStyles: { fillColor: [46, 204, 113], textColor: 255 },
            margin: { left: 14, right: 14 },
            tableWidth: pageWidth - 28,
          });
        } else {
          // No PQR associated
          doc.setFontSize(12);
          doc.setTextColor(150, 150, 150);
          doc.text('No PQR document associated with this WPS', 14, yPos);
        }
      });
      
      // Save the PDF
      doc.save('WPS_PQR_Report.pdf');

      toast({
        title: 'PDF Generated',
        description: 'The WPS & PQR report has been successfully exported to PDF',
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
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>WPS & PQR Report Generation</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wpsId">WPS ID (Optional)</Label>
              <Input 
                id="wpsId" 
                placeholder="e.g. WPS-1" 
                value={wpsIdFilter}
                onChange={(e) => setWpsIdFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pqrId">PQR ID (Optional)</Label>
              <Input 
                id="pqrId" 
                placeholder="e.g. PQR-1" 
                value={pqrIdFilter}
                onChange={(e) => setPqrIdFilter(e.target.value)}
              />
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
                <h3 className="text-lg font-medium">Report Results ({reportData.length} document{reportData.length !== 1 ? 's' : ''})</h3>
                <Button onClick={handleExportPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</>
                  ) : (
                    <><Download className="mr-2 h-4 w-4" /> Export to PDF</>
                  )}
                </Button>
              </div>
              
              {/* Report Preview */}
              <div className="space-y-6">
                {reportData.map((wps) => (
                  <Card key={wps.wps_id} className="shadow-sm">
                    <CardHeader className="bg-muted/50">
                      <CardTitle className="flex justify-between">
                        <span>WPS: {wps.wps_number}</span>
                        <span className="text-sm font-normal">{wps.wps_status}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Base Metal:</span> {wps.base_metal_grade}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Filler Material:</span> {wps.filler_material}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Welding Process:</span> {wps.welder_process}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Joint Type:</span> {wps.joint_type}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Weld Position:</span> {wps.weld_position}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Thickness:</span> {wps.base_metal_thickness}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Shielding Gas:</span> {wps.shielding_gas || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Heat Treatment:</span> {wps.post_weld_heat_treatment || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Created By:</span> {wps.wps_created_by_user}
                        </div>
                      </div>
                      
                      {wps.has_pqr && (
                        <div className="mt-4 pt-4 border-t">
                          <h4 className="font-medium mb-2">PQR: {wps.pqr_number}</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Test Date:</span> {wps.pqr_test_date ? formatDate(wps.pqr_test_date) : 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Laboratory:</span> {wps.pqr_test_laboratory || 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Test Type:</span> {wps.pqr_test_type || 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status:</span> {wps.pqr_status || 'N/A'}
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Results:</span> {wps.pqr_test_results || 'N/A'}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {isReportGenerated && reportData.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No WPS documents found matching the filter criteria.</p>
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