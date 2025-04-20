import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { 
  CalendarIcon, 
  ClipboardList, 
  Download, 
  FileText, 
  History, 
  Plus, 
  Printer, 
  Trash, 
  Settings2, 
  Eye, 
  Edit 
} from "lucide-react";
import { format } from "date-fns";

export default function QualityReportsPage() {
  const { user } = useAuth();
  const canManageQuality = user?.role === "Superuser" || user?.role === "Manager" || 
                           user?.role === "Senior Manager" || user?.role === "General Manager";

  // Get the tab from URL query parameter if available
  const getTabFromURL = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      
      // Validate that tab is one of our valid tab values
      if (tab === 'qap-templates' || tab === 'generated-qaps' || 
          tab === 'itp-templates' || tab === 'generated-itps') {
        return tab;
      }
    }
    
    // Default to ITP templates if no valid tab in URL
    return "itp-templates";
  };

  // Set default tab based on URL or default to itp-templates
  const [activeTab, setActiveTab] = useState(getTabFromURL());

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    
    // Update URL without full page reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', value);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Effect to update tab when URL changes (browser back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromURL());
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Quality Management | Thermopac</title>
      </Helmet>
      
      <div className="space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold">Quality Management</h1>
          <p className="text-muted-foreground">
            Manage quality assurance templates and generate quality reports for projects.
          </p>
        </div>
        
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid grid-cols-4 mb-8">
            <TabsTrigger value="qap-templates">QAP Templates</TabsTrigger>
            <TabsTrigger value="generated-qaps">Generated QAPs</TabsTrigger>
            <TabsTrigger value="itp-templates">ITP Templates</TabsTrigger>
            <TabsTrigger value="generated-itps">Generated ITPs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="qap-templates">
            <QAPTemplatesTab />
          </TabsContent>
          
          <TabsContent value="generated-qaps">
            <Card>
              <CardContent className="p-6">
                <p>QAP Generation tab content (to be implemented)</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="itp-templates">
            <ITPTemplatesTab />
          </TabsContent>
          
          <TabsContent value="generated-itps">
            <Card>
              <CardContent className="p-6">
                <p>Generated ITPs tab content (to be implemented)</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// QAP Templates Tab
function QAPTemplatesTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Template schema
  const templateFormSchema = z.object({
    name: z.string().min(1, "Template name is required"),
    description: z.string().min(1, "Description is required"),
    content: z.string().min(1, "Template content is required"),
    version: z.string().min(1, "Version is required"),
  });
  
  // Form setup
  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      content: `
  <div class="qap-container">
    <div class="qap-header">
      <h2>QUALITY ASSURANCE PLAN (QAP)</h2>
      <table width="100%" border="1" cellpadding="2" cellspacing="0">
        <tr>
          <td colspan="2" width="33%"><strong>MANUFACTURER:</strong><br/>
          <strong>THERMOPAC PROCESS ENGG. LLP</strong><br/>
          CIN: AAD-8929<br/>
          L4 405,THE CAPITOL, BANDRA KURLA COMPLEX<br/>
          EXPRESS HIGHWAY, VILE PARLE (EAST)<br/>
          MUMBAI 400057 MAHARASHTRA, INDIA</td>
          <td colspan="2" width="33%"><strong>CUSTOMER:</strong><br/>
          {{customer}}<br/>
          {{customerAddress1}}<br/>
          {{customerAddress2}}<br/>
          {{customerCity}}</td>
          <td width="17%"><strong>ITEM:</strong> {{itemDescription}}<br/>
          <strong>REFERENCE DRG. NO:</strong> {{drawingNumber}}<br/>
          <strong>REV.:</strong> {{revision}}</td>
          <td width="17%"><strong>PROJECT:</strong><br/>{{projectName}}<br/>
          <strong>PACKAGE:</strong><br/>{{package}}</td>
        </tr>
        <tr>
          <td><strong>QAP NO.:</strong><br/>{{qapNumber}}</td>
          <td><strong>REV.NO.:</strong> {{revisionNumber}}</td>
          <td><strong>PO NO.:</strong><br/>{{poNumber}}</td>
          <td><strong>DATE:</strong><br/>{{dateIssued}}</td>
          <td><strong>DATE:</strong><br/>{{dateApproved}}</td>
          <td><strong>MAIN CONTRACTOR:</strong><br/>{{mainContractor}}</td>
        </tr>
      </table>
    </div>
    
    <!-- Main Inspection Table -->
    <div class="qap-inspection-table">
      <table width="100%" border="1" cellpadding="3" cellspacing="0" class="inspection-table">
        <tr>
          <th rowspan="2">SL.NO</th>
          <th rowspan="2">COMPONENT & OPERATION</th>
          <th rowspan="2">CHARACTERISTICS CHECKED</th>
          <th rowspan="2">CLASS</th>
          <th rowspan="2">TYPE OF CHECK</th>
          <th rowspan="2">QTY NO.</th>
          <th rowspan="2">QUANTAM OF CHECK</th>
          <th rowspan="2">REFERENCE DOCUMENT</th>
          <th rowspan="2">ACCEPTANCE NORMS</th>
          <th rowspan="2">FORMAT OF RECORDS</th>
          <th colspan="3">AGENCY</th>
          <th rowspan="2">REMARKS</th>
        </tr>
        <tr>
          <th>M</th>
          <th>C</th>
          <th>SGS</th>
        </tr>
        <tr>
          <td align="center" rowspan="6">I</td>
          <td colspan="14" class="section-header"><strong>RAW MATERIAL</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Shell, Dished end, lugs & lug pads</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All plates</td>
          <td>ASME</td>
          <td>ASTM A516 GR.70/ASTM A537 GR.B</td>
          <td>Compliance to standard</td>
          <td>Mill material test certificate OR Lab test report (if reqd.)</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Pipes for all Nozzles</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All pipes</td>
          <td>ASME</td>
          <td>ASTM A106 GR.B/ASTM A312 TP316</td>
          <td>Compliance to standard</td>
          <td>Mill material test certificate OR Lab test report (if reqd.)</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>All Flanges</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All plates</td>
          <td>ASME</td>
          <td>ASTM A105 /ASTM A182</td>
          <td>Compliance to standard</td>
          <td>Lab test report & QC report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center" rowspan="7">IV</td>
          <td colspan="14" class="section-header"><strong>WELDING</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>WPS & PQR Qualification</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All WPS</td>
          <td>ASME Sec IX</td>
          <td>Compliance to standards</td>
          <td>Qualified WPS/PQR</td>
          <td align="center">P</td>
          <td align="center">R</td>
          <td align="center">R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Welder Qualification</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All welders</td>
          <td>ASME Sec IX</td>
          <td>Compliance to standards</td>
          <td>WPQ Certificates</td>
          <td align="center">P</td>
          <td align="center">R</td>
          <td align="center">R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>Welding Consumables</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All batches</td>
          <td>ASME Sec II C</td>
          <td>Compliance to standards</td>
          <td>MTC</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center" rowspan="5">III</td>
          <td colspan="14" class="section-header"><strong>FINAL INSPECTION & TESTING</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Final dimensional inspection</td>
          <td>Dimensional</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>100%</td>
          <td>Complete vessel</td>
          <td>Approved Drawing</td>
          <td>As per drawing</td>
          <td>Dimensional Report</td>
          <td align="center">P</td>
          <td align="center">W</td>
          <td align="center">H</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Hydrotest</td>
          <td>Visual/Pressure</td>
          <td>Critical</td>
          <td>Hydro</td>
          <td>100%</td>
          <td>Complete vessel</td>
          <td>ASME Sec VIII, Test procedure</td>
          <td>No leakage, No deformation</td>
          <td>Hydrotest Report</td>
          <td align="center">P</td>
          <td align="center">W</td>
          <td align="center">H</td>
          <td>Test pressure: {{testPressure}}</td>
        </tr>
      </table>
    </div>
    
    <!-- Legend and Signature Section -->
    <div class="qap-footer">
      <div style="display: flex; width: 100%; margin-bottom: 10px;">
        <div style="width: 50%; text-align: left;">
          <div class="thermopac-logo">
            <div style="color: #0000ff; font-weight: bold; font-size: 24px; line-height: 1;">
              THERMOPAC
            </div>
            <div style="color: #ff0000; font-size: 18px; line-height: 1;">
              PROCESS ENGINEERING LLP
            </div>
          </div>
        </div>
        <div style="width: 50%; text-align: right;">
          <div style="border: 1px solid #ccc; display: inline-block; width: 100px; height: 100px; border-radius: 50%; text-align: center; padding-top: 30px; font-size: 12px;">
            QAP/QC<br>APPROVED
          </div>
        </div>
      </div>
      
      <table width="100%" border="1" cellpadding="3" cellspacing="0">
        <tr>
          <td colspan="5" style="background-color: #f5f5f5;"><strong>LEGEND:</strong></td>
        </tr>
        <tr>
          <td width="10%"><strong>M</strong></td>
          <td width="30%">MANUFACTURER/SUB SUPPLIER</td>
          <td width="10%"><strong>P</strong></td>
          <td width="30%">PERFORM</td>
          <td width="20%" rowspan="4">NOTE: The supplier/vendor shall not proceed to the next stage unless the hold points are cleared by the concerned Inspector</td>
        </tr>
        <tr>
          <td><strong>C</strong></td>
          <td>CUSTOMER</td>
          <td><strong>W</strong></td>
          <td>WITNESS</td>
        </tr>
        <tr>
          <td><strong>SGS</strong></td>
          <td>APPROVED INSPECTION AGENCY</td>
          <td><strong>H</strong></td>
          <td>HOLD</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td><strong>V</strong></td>
          <td>VERIFICATION</td>
        </tr>
      </table>
      
      <table width="100%" border="1" cellpadding="3" cellspacing="0" style="margin-top: 15px;">
        <tr style="background-color: #f5f5f5;">
          <td width="33%"><strong>PREPARED BY:</strong></td>
          <td width="33%"><strong>REVIEWED BY:</strong></td>
          <td width="34%"><strong>APPROVED BY:</strong></td>
        </tr>
        <tr>
          <td height="60" style="vertical-align: bottom;">{{preparedBy}}<br/>{{preparedDesignation}}</td>
          <td style="vertical-align: bottom;">{{reviewedBy}}<br/>{{reviewedDesignation}}</td>
          <td style="vertical-align: bottom;">{{approvedBy}}<br/>{{approvedDesignation}}</td>
        </tr>
        <tr>
          <td>Date: {{preparedDate}}</td>
          <td>Date: {{reviewedDate}}</td>
          <td>Date: {{approvedDate}}</td>
        </tr>
      </table>
    </div>
  </div>
  
  <style>
    @page {
      size: A3 landscape;
      margin: 0.5cm;
    }
    .qap-container {
      font-family: Arial, sans-serif;
      margin: 10px;
      font-size: 10pt;
      width: 100%;
      max-width: 1180px; /* A3 landscape width approximate */
    }
    .qap-header, .qap-inspection-table, .qap-footer {
      margin-bottom: 10px;
      width: 100%;
    }
    .qap-header h2 {
      font-size: 16pt;
      font-weight: bold;
      margin: 0;
      padding: 5px 0;
      text-align: center;
      text-transform: uppercase;
    }
    .section-header {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: center;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
    }
    table, th, td {
      border: 1px solid #000;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      padding: 5px 3px;
      text-align: center;
      vertical-align: middle;
      font-size: 9pt;
      text-transform: uppercase;
    }
    td {
      padding: 4px 3px;
      vertical-align: top;
      font-size: 9pt;
    }
    /* Column widths for QAP format */
    .inspection-table th:nth-child(1) { width: 3%; } /* SL.NO */
    .inspection-table th:nth-child(2) { width: 15%; } /* COMPONENT & OPERATION */
    .inspection-table th:nth-child(3) { width: 12%; } /* CHARACTERISTICS CHECKED */
    .inspection-table th:nth-child(4) { width: 5%; } /* CLASS */
    .inspection-table th:nth-child(5) { width: 6%; } /* TYPE OF CHECK */
    .inspection-table th:nth-child(6) { width: 5%; } /* QTY NO. */
    .inspection-table th:nth-child(7) { width: 8%; } /* QUANTAM OF CHECK */
    .inspection-table th:nth-child(8) { width: 8%; } /* REFERENCE DOCUMENT */
    .inspection-table th:nth-child(9) { width: 12%; } /* ACCEPTANCE NORMS */
    .inspection-table th:nth-child(10) { width: 12%; } /* FORMAT OF RECORDS */
    .inspection-table th:nth-child(11) { width: 2%; } /* M */
    .inspection-table th:nth-child(12) { width: 2%; } /* C */
    .inspection-table th:nth-child(13) { width: 2%; } /* SGS */
    .inspection-table th:nth-child(14) { width: 8%; } /* REMARKS */
  </style>
      `,
      version: "1.0",
    },
  });
  
  // Edit form setup
  const editForm = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "",
      version: "",
    },
  });
  
  // Query templates
  const { data: templates = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['api/quality/qap-templates'],
    throwOnError: false,
    enabled: true,
  });
  
  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof templateFormSchema>) => {
      return apiRequest('POST', 'api/quality/qap-templates', values);
    },
    onSuccess: () => {
      toast({
        title: "Template created",
        description: "QAP template has been created successfully",
      });
      setIsCreateDialogOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof templateFormSchema>) => {
      return apiRequest('PUT', `api/quality/qap-templates/${selectedTemplate.id}`, values);
    },
    onSuccess: () => {
      toast({
        title: "Template updated",
        description: "QAP template has been updated successfully",
      });
      setIsEditDialogOpen(false);
      editForm.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `api/quality/qap-templates/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Template deleted",
        description: "QAP template has been deleted successfully",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle template creation
  const onSubmit = (values: z.infer<typeof templateFormSchema>) => {
    createTemplateMutation.mutate(values);
  };
  
  // Handle template update
  const onUpdate = (values: z.infer<typeof templateFormSchema>) => {
    updateTemplateMutation.mutate(values);
  };
  
  // Handle view template
  const handleViewTemplate = (template: any) => {
    setSelectedTemplate(template);
    setIsViewDialogOpen(true);
  };
  
  // Handle edit template
  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    editForm.reset({
      name: template.name,
      description: template.description,
      content: template.content,
      version: template.version,
    });
    setIsEditDialogOpen(true);
  };
  
  // Handle delete template
  const handleDeleteTemplate = (id: number) => {
    if (window.confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      deleteTemplateMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">QAP Templates</h2>
        {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager") && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        )}
      </div>
      
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : templates?.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No QAP templates found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Date Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map((template: any) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.description}</TableCell>
                <TableCell>{template.version}</TableCell>
                <TableCell>{template.creator?.username || 'Unknown'}</TableCell>
                <TableCell>{format(new Date(template.createdAt), 'MMM dd, yyyy')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewTemplate(template)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager") && (
                      <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {user?.role === "Superuser" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      
      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create QAP Template</DialogTitle>
            <DialogDescription>
              Create a new QAP template with placeholders for dynamic content.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Standard QAP Template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the purpose of this template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version</FormLabel>
                    <FormControl>
                      <Input placeholder="1.0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Content</FormLabel>
                    <FormDescription>
                      Use placeholders like &#123;&#123;title&#125;&#125;, &#123;&#123;projectName&#125;&#125;, etc. for dynamic content.
                    </FormDescription>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter HTML content with placeholders" 
                        className="min-h-[300px] font-mono text-sm"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTemplateMutation.isPending}>
                  {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View Template Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              Version {selectedTemplate?.version} - Created by {selectedTemplate?.creator?.username || 'Unknown'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Description</h3>
              <p className="text-muted-foreground mt-1">{selectedTemplate?.description}</p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-sm font-medium mb-2">Template Content</h3>
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm overflow-auto max-h-[400px]">
                  {selectedTemplate?.content}
                </pre>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit QAP Template</DialogTitle>
            <DialogDescription>
              Update the QAP template details and content.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-6">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Standard QAP Template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the purpose of this template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Version</FormLabel>
                    <FormControl>
                      <Input placeholder="1.0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Content</FormLabel>
                    <FormDescription>
                      Use placeholders like &#123;&#123;title&#125;&#125;, &#123;&#123;projectName&#125;&#125;, etc. for dynamic content.
                    </FormDescription>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter HTML content with placeholders" 
                        className="min-h-[300px] font-mono text-sm"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending ? "Updating..." : "Update Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ITP Templates Tab
function ITPTemplatesTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Template schema with additional fields specific to ITP templates
  const templateFormSchema = z.object({
    name: z.string().min(1, "Template name is required"),
    description: z.string().min(1, "Description is required"),
    category: z.string().min(1, "Category is required"),
    content: z.string().min(1, "Template content is required"),
    version: z.string().min(1, "Version is required"),
    tags: z.string().optional(),
  });
  
  // Define default template content structure
  const defaultTemplateContent = `
  <div class="itp-container">
    <div class="itp-header">
      <h2>QUALITY ASSURANCE PLAN (QAP)</h2>
      <table width="100%" border="1" cellpadding="2" cellspacing="0">
        <tr>
          <td colspan="2" width="33%"><strong>MANUFACTURER:</strong><br/>
          <strong>THERMOPAC PROCESS ENGG. LLP</strong><br/>
          CIN: AAD-8929<br/>
          L4 405,THE CAPITOL, BANDRA KURLA COMPLEX<br/>
          EXPRESS HIGHWAY, VILE PARLE (EAST)<br/>
          MUMBAI 400057 MAHARASHTRA, INDIA</td>
          <td colspan="2" width="33%"><strong>CUSTOMER:</strong><br/>
          {{customer}}<br/>
          {{customerAddress1}}<br/>
          {{customerAddress2}}<br/>
          {{customerCity}}</td>
          <td width="17%"><strong>ITEM:</strong> {{itemDescription}}<br/>
          <strong>REFERENCE DRG. NO:</strong> {{drawingNumber}}<br/>
          <strong>REV.:</strong> {{revision}}</td>
          <td width="17%"><strong>PROJECT:</strong><br/>{{projectName}}<br/>
          <strong>PACKAGE:</strong><br/>{{package}}</td>
        </tr>
        <tr>
          <td><strong>QAP NO.:</strong><br/>{{qapNumber}}</td>
          <td><strong>REV.NO.:</strong> {{revisionNumber}}</td>
          <td><strong>PO NO.:</strong><br/>{{poNumber}}</td>
          <td><strong>DATE:</strong><br/>{{dateIssued}}</td>
          <td><strong>DATE:</strong><br/>{{dateApproved}}</td>
          <td><strong>MAIN CONTRACTOR:</strong><br/>{{mainContractor}}</td>
        </tr>
      </table>
    </div>
    
    <!-- Main Inspection Table -->
    <div class="itp-inspection-table">
      <table width="100%" border="1" cellpadding="3" cellspacing="0" class="inspection-table">
        <tr>
          <th rowspan="2">SL.NO</th>
          <th rowspan="2">COMPONENT & OPERATION</th>
          <th rowspan="2">CHARACTERISTICS CHECKED</th>
          <th rowspan="2">CLASS</th>
          <th rowspan="2">TYPE OF CHECK</th>
          <th rowspan="2">QTY NO.</th>
          <th rowspan="2">QUANTAM OF CHECK</th>
          <th rowspan="2">REFERENCE DOCUMENT</th>
          <th rowspan="2">ACCEPTANCE NORMS</th>
          <th rowspan="2">FORMAT OF RECORDS</th>
          <th colspan="3">AGENCY</th>
          <th rowspan="2">REMARKS</th>
        </tr>
        <tr>
          <th>M</th>
          <th>C</th>
          <th>SGS</th>
        </tr>
        <tr>
          <td align="center" rowspan="6">I</td>
          <td colspan="14" class="section-header"><strong>RAW MATERIAL</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Shell, Dished end, lugs & lug pads</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All plates</td>
          <td>ASME</td>
          <td>ASTM A516 GR.70/ASTM A537 GR.B</td>
          <td>Compliance to standard</td>
          <td>Mill material test certificate OR Lab test report (if reqd.)</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Pipes for all Nozzles</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All pipes</td>
          <td>ASME</td>
          <td>ASTM A106 GR.B/ASTM A312 TP316</td>
          <td>Compliance to standard</td>
          <td>Mill material test certificate OR Lab test report (if reqd.)</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>All Flanges</td>
          <td>Physical & Chem./Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>All plates</td>
          <td>ASME</td>
          <td>ASTM A105 /ASTM A182</td>
          <td>Compliance to standard</td>
          <td>Lab test report & QC report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center" rowspan="7">IV</td>
          <td colspan="14" class="section-header"><strong>WELDING</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>WPS & PQR Qualification</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All WPS</td>
          <td>ASME Sec IX</td>
          <td>Compliance to standards</td>
          <td>Qualified WPS/PQR</td>
          <td align="center">P</td>
          <td align="center">R</td>
          <td align="center">R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Welder Qualification</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All welders</td>
          <td>ASME Sec IX</td>
          <td>Compliance to standards</td>
          <td>WPQ Certificates</td>
          <td align="center">P</td>
          <td align="center">R</td>
          <td align="center">R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>Welding Consumables</td>
          <td>Document Review</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All batches</td>
          <td>ASME Sec II C</td>
          <td>Compliance to standards</td>
          <td>MTC</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center" rowspan="12">II</td>
          <td colspan="14" class="section-header"><strong>IN PROCESS INSPECTION</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Material Identification</td>
          <td>Visual/Check Heat No.</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>100%</td>
          <td>ASME</td>
          <td>Drawing Requirements</td>
          <td>Compliance with TC</td>
          <td>QC Report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Dimensional check of component parts</td>
          <td>Visual & Dimensional</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>100%</td>
          <td>Drawing</td>
          <td>Drawing Requirements</td>
          <td>As per drawing</td>
          <td>QC Report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>Fit up for welding</td>
          <td>Dimensional/Visual</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>100%</td>
          <td>All joints</td>
          <td>Approved Drawing, WPS</td>
          <td>As per drawing & WPS</td>
          <td>Fit-up Inspection Report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">4</td>
          <td>Visual inspection after welding</td>
          <td>Visual/Dimensional</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>All welds</td>
          <td>ASME Sec VIII Div 1</td>
          <td>As per ASME code & drawing</td>
          <td>QC Report</td>
          <td align="center">P</td>
          <td align="center">-</td>
          <td align="center">V</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center" rowspan="5">III</td>
          <td colspan="14" class="section-header"><strong>FINAL INSPECTION & TESTING</strong></td>
        </tr>
        <tr>
          <td align="center">1</td>
          <td>Final dimensional inspection</td>
          <td>Dimensional</td>
          <td>Major</td>
          <td>Measurement</td>
          <td>100%</td>
          <td>Complete vessel</td>
          <td>Approved Drawing</td>
          <td>As per drawing</td>
          <td>Dimensional Report</td>
          <td align="center">P</td>
          <td align="center">W</td>
          <td align="center">H</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">2</td>
          <td>Hydrotest</td>
          <td>Visual/Pressure</td>
          <td>Critical</td>
          <td>Hydro</td>
          <td>100%</td>
          <td>Complete vessel</td>
          <td>ASME Sec VIII, Test procedure</td>
          <td>No leakage, No deformation</td>
          <td>Hydrotest Report</td>
          <td align="center">P</td>
          <td align="center">W</td>
          <td align="center">H</td>
          <td>Test pressure: {{testPressure}}</td>
        </tr>
        <tr>
          <td align="center">3</td>
          <td>Final inspection & documentation review</td>
          <td>Visual/Documents</td>
          <td>Major</td>
          <td>Visual</td>
          <td>100%</td>
          <td>Complete vessel</td>
          <td>All codes & standards</td>
          <td>All documentation complete</td>
          <td>Final QC Report</td>
          <td align="center">P</td>
          <td align="center">W</td>
          <td align="center">H</td>
          <td></td>
        </tr>
      </table>
    </div>
    
    <!-- Legend and Signature Section -->
    <div class="itp-footer">
      <div style="display: flex; width: 100%; margin-bottom: 10px;">
        <div style="width: 50%; text-align: left;">
          <div class="thermopac-logo">
            <div style="color: #0000ff; font-weight: bold; font-size: 24px; line-height: 1;">
              THERMOPAC
            </div>
            <div style="color: #ff0000; font-size: 18px; line-height: 1;">
              PROCESS ENGINEERING LLP
            </div>
          </div>
        </div>
        <div style="width: 50%; text-align: right;">
          <div style="border: 1px solid #ccc; display: inline-block; width: 100px; height: 100px; border-radius: 50%; text-align: center; padding-top: 30px; font-size: 12px;">
            QAP/QC<br>APPROVED
          </div>
        </div>
      </div>
      
      <table width="100%" border="1" cellpadding="3" cellspacing="0">
        <tr>
          <td colspan="5" style="background-color: #f5f5f5;"><strong>LEGEND:</strong></td>
        </tr>
        <tr>
          <td width="10%"><strong>M</strong></td>
          <td width="30%">MANUFACTURER/SUB SUPPLIER</td>
          <td width="10%"><strong>P</strong></td>
          <td width="30%">PERFORM</td>
          <td width="20%" rowspan="4">NOTE: The supplier/vendor shall not proceed to the next stage unless the hold points are cleared by the concerned Inspector</td>
        </tr>
        <tr>
          <td><strong>C</strong></td>
          <td>CUSTOMER</td>
          <td><strong>W</strong></td>
          <td>WITNESS</td>
        </tr>
        <tr>
          <td><strong>SGS</strong></td>
          <td>APPROVED INSPECTION AGENCY</td>
          <td><strong>H</strong></td>
          <td>HOLD</td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td><strong>V</strong></td>
          <td>VERIFICATION</td>
        </tr>
      </table>
      
      <table width="100%" border="1" cellpadding="3" cellspacing="0" style="margin-top: 15px;">
        <tr style="background-color: #f5f5f5;">
          <td width="33%"><strong>PREPARED BY:</strong></td>
          <td width="33%"><strong>REVIEWED BY:</strong></td>
          <td width="34%"><strong>APPROVED BY:</strong></td>
        </tr>
        <tr>
          <td height="60" style="vertical-align: bottom;">{{preparedBy}}<br/>{{preparedDesignation}}</td>
          <td style="vertical-align: bottom;">{{reviewedBy}}<br/>{{reviewedDesignation}}</td>
          <td style="vertical-align: bottom;">{{approvedBy}}<br/>{{approvedDesignation}}</td>
        </tr>
        <tr>
          <td>Date: {{preparedDate}}</td>
          <td>Date: {{reviewedDate}}</td>
          <td>Date: {{approvedDate}}</td>
        </tr>
      </table>
    </div>
  </div>
  
  <style>
    @page {
      size: A3 landscape;
      margin: 0.5cm;
    }
    .itp-container {
      font-family: Arial, sans-serif;
      margin: 10px;
      font-size: 10pt;
      width: 100%;
      max-width: 1180px; /* A3 landscape width approximate */
    }
    .itp-header, .itp-inspection-table, .itp-footer {
      margin-bottom: 10px;
      width: 100%;
    }
    .itp-header h2 {
      font-size: 16pt;
      font-weight: bold;
      margin: 0;
      padding: 5px 0;
      text-align: center;
      text-transform: uppercase;
    }
    .section-header {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: center;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
    }
    table, th, td {
      border: 1px solid #000;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      padding: 5px 3px;
      text-align: center;
      vertical-align: middle;
      font-size: 9pt;
      text-transform: uppercase;
    }
    td {
      padding: 4px 3px;
      vertical-align: top;
      font-size: 9pt;
    }
    /* Column widths for QAP format */
    .inspection-table th:nth-child(1) { width: 3%; } /* SL.NO */
    .inspection-table th:nth-child(2) { width: 12%; } /* COMPONENT & OPERATION */
    .inspection-table th:nth-child(3) { width: 10%; } /* CHARACTERISTICS CHECKED */
    .inspection-table th:nth-child(4) { width: 5%; } /* CLASS */
    .inspection-table th:nth-child(5) { width: 5%; } /* TYPE OF CHECK */
    .inspection-table th:nth-child(6) { width: 5%; } /* QTY NO. */
    .inspection-table th:nth-child(7) { width: 6%; } /* QUANTAM OF CHECK */
    .inspection-table th:nth-child(8) { width: 10%; } /* REFERENCE DOCUMENT */
    .inspection-table th:nth-child(9) { width: 10%; } /* ACCEPTANCE NORMS */
    .inspection-table th:nth-child(10) { width: 10%; } /* FORMAT OF RECORDS */
    .inspection-table th:nth-child(11) { width: 3%; } /* AGENCY M */
    .inspection-table th:nth-child(12) { width: 3%; } /* AGENCY C */
    .inspection-table th:nth-child(13) { width: 3%; } /* AGENCY SGS */
    .inspection-table th:nth-child(14) { width: 10%; } /* REMARKS */
    
    .itp-header td {
      font-size: 8pt;
      line-height: 1.2;
      vertical-align: middle;
    }
    strong {
      font-weight: bold;
    }
    .centered {
      text-align: center;
    }
    .inspection-by-cell {
      text-align: center;
      line-height: 1.2;
    }
    /* Excel-like styling */
    th, td {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      border: 1px solid #000;
    }
    tr:nth-child(even) {
      background-color: #fcfcfc;
    }
    /* Print-friendly styles */
    @media print {
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }
      .itp-container {
        margin: 0;
        padding: 5mm;
        font-size: 9pt;
        box-sizing: border-box;
        width: 100%;
      }
      table, th, td {
        border: 1px solid #000;
      }
      th {
        background-color: #f5f5f5 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .section-header {
        background-color: #f2f2f2 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
  `;
  
  // Form setup
  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "Pressure Vessel",
      content: defaultTemplateContent,
      version: "1.0",
      tags: "ITP,inspection,quality",
    },
  });
  
  // Edit form setup
  const editForm = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      content: "",
      version: "",
      tags: "",
    },
  });
  
  // Query templates
  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ['/api/quality/itp-templates'],
    throwOnError: false,
    enabled: true,
  });
  
  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof templateFormSchema>) => {
      // Convert tags string to array
      const tagsArray = values.tags ? values.tags.split(',').map(tag => tag.trim()) : [];
      
      // Create placeholders object based on content analysis
      const placeholderRegex = /{{(.*?)}}/g;
      let match;
      const placeholders: Record<string, string> = {};
      
      while ((match = placeholderRegex.exec(values.content)) !== null) {
        placeholders[match[1]] = "";
      }
      
      return apiRequest('/api/quality/itp-templates', 'POST', {
        ...values,
        tags: tagsArray,
        placeholders: placeholders
      });
    },
    onSuccess: () => {
      toast({
        title: "Template created",
        description: "ITP template has been created successfully",
      });
      setIsCreateDialogOpen(false);
      form.reset({
        name: "",
        description: "",
        category: "Pressure Vessel",
        content: defaultTemplateContent,
        version: "1.0",
        tags: "ITP,inspection,quality",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof templateFormSchema>) => {
      // Convert tags string to array
      const tagsArray = values.tags ? values.tags.split(',').map(tag => tag.trim()) : [];
      
      // Create placeholders object based on content analysis
      const placeholderRegex = /{{(.*?)}}/g;
      let match;
      const placeholders: Record<string, string> = {};
      
      while ((match = placeholderRegex.exec(values.content)) !== null) {
        placeholders[match[1]] = "";
      }
      
      return apiRequest(`/api/quality/itp-templates/${selectedTemplate.id}`, 'PUT', {
        ...values,
        tags: tagsArray,
        placeholders: placeholders
      });
    },
    onSuccess: () => {
      toast({
        title: "Template updated",
        description: "ITP template has been updated successfully",
      });
      setIsEditDialogOpen(false);
      editForm.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/quality/itp-templates/${id}`, 'DELETE');
    },
    onSuccess: () => {
      toast({
        title: "Template deleted",
        description: "ITP template has been deleted successfully",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete template",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle template creation
  const onSubmit = (values: z.infer<typeof templateFormSchema>) => {
    createTemplateMutation.mutate(values);
  };
  
  // Handle template update
  const onUpdate = (values: z.infer<typeof templateFormSchema>) => {
    updateTemplateMutation.mutate(values);
  };
  
  // Handle view template
  const handleViewTemplate = (template: any) => {
    setSelectedTemplate(template);
    setIsViewDialogOpen(true);
  };
  
  // Handle edit template
  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    
    // Convert tags array to string if needed
    const tagsString = Array.isArray(template.tags) ? template.tags.join(', ') : template.tags;
    
    editForm.reset({
      name: template.name,
      description: template.description,
      category: template.category || '',
      content: template.content,
      version: template.version,
      tags: tagsString || '',
    });
    setIsEditDialogOpen(true);
  };
  
  // Handle delete template
  const handleDeleteTemplate = (id: number) => {
    if (window.confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      deleteTemplateMutation.mutate(id);
    }
  };

  // Helper function to truncate text
  const truncateText = (text: string, maxLength: number = 50) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">ITP Templates</h2>
        {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager") && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        )}
      </div>
      
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No ITP templates found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Date Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map((template: any) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>{template.category || 'General'}</TableCell>
                <TableCell>{truncateText(template.description)}</TableCell>
                <TableCell>{template.version}</TableCell>
                <TableCell>{template.creator?.username || 'Unknown'}</TableCell>
                <TableCell>{format(new Date(template.createdAt), 'MMM dd, yyyy')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewTemplate(template)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager") && (
                      <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {user?.role === "Superuser" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      
      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create ITP Template</DialogTitle>
            <DialogDescription>
              Create a new Inspection and Test Plan template with placeholders for dynamic content.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., Pressure Vessel ITP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input placeholder="1.0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                          <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                          <SelectItem value="Piping">Piping</SelectItem>
                          <SelectItem value="Structure">Structure</SelectItem>
                          <SelectItem value="Electrical">Electrical</SelectItem>
                          <SelectItem value="Instrumentation">Instrumentation</SelectItem>
                          <SelectItem value="General">General</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., pressure,vessel,inspection" {...field} />
                      </FormControl>
                      <FormDescription>
                        Comma-separated list of tags
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the purpose of this template" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Content</FormLabel>
                    <FormDescription>
                      Use placeholders like &#123;&#123;manufacturerName&#125;&#125;, &#123;&#123;projectName&#125;&#125;, etc. for dynamic content.
                    </FormDescription>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter HTML content with placeholders" 
                        className="min-h-[400px] font-mono text-sm"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTemplateMutation.isPending}>
                  {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit ITP Template</DialogTitle>
            <DialogDescription>
              Update the existing Inspection and Test Plan template.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                          <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                          <SelectItem value="Piping">Piping</SelectItem>
                          <SelectItem value="Structure">Structure</SelectItem>
                          <SelectItem value="Electrical">Electrical</SelectItem>
                          <SelectItem value="Instrumentation">Instrumentation</SelectItem>
                          <SelectItem value="General">General</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        Comma-separated list of tags
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Content</FormLabel>
                    <FormDescription>
                      Use placeholders like &#123;&#123;manufacturerName&#125;&#125;, &#123;&#123;projectName&#125;&#125;, etc. for dynamic content.
                    </FormDescription>
                    <FormControl>
                      <Textarea 
                        className="min-h-[400px] font-mono text-sm"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending ? "Updating..." : "Update Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View Template Dialog */}
      {selectedTemplate && (
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTemplate.name}</DialogTitle>
              <DialogDescription>
                {selectedTemplate.description}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <div className="mt-1">{selectedTemplate.category || 'General'}</div>
                </div>
                <div>
                  <Label>Version</Label>
                  <div className="mt-1">{selectedTemplate.version}</div>
                </div>
              </div>
              
              <div>
                <Label>Tags</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Array.isArray(selectedTemplate.tags) && selectedTemplate.tags.map((tag: string, index: number) => (
                    <Badge key={index} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Template Preview</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      // Open in a new window for print view
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>${selectedTemplate.name} - Preview</title>
                              <style>
                                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                                @media print {
                                  body { margin: 0; padding: 0; }
                                  button { display: none; }
                                }
                                ${selectedTemplate.content.match(/<style>([\s\S]*?)<\/style>/)?.[1] || ''}
                              </style>
                            </head>
                            <body>
                              <div style="text-align: right; margin-bottom: 10px;">
                                <button onclick="window.print()">Print</button>
                              </div>
                              ${selectedTemplate.content.replace(/<style>[\s\S]*?<\/style>/, '')}
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" /> Print Preview
                  </Button>
                </div>
                <Card className="mt-1 p-4 overflow-auto max-h-[500px] bg-white border-2">
                  <div dangerouslySetInnerHTML={{ __html: selectedTemplate.content }} />
                </Card>
              </div>
              
              <div>
                <Label>Available Placeholders</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {selectedTemplate.placeholders && Object.keys(selectedTemplate.placeholders).map((placeholder: string) => (
                    <Badge key={placeholder} variant="secondary">{'{{' + placeholder + '}}'}</Badge>
                  ))}
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}