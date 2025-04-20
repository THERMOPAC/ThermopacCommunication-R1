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
        
        <Tabs defaultValue="itp-templates">
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
      content: "<h1>{{title}}</h1>\n<p>Project: {{projectName}}</p>\n<p>Client: {{clientName}}</p>\n<p>Equipment: {{equipmentType}}</p>\n<p>Standards: {{standards}}</p>\n<p>Revision: {{revision}}</p>\n<p>Prepared by: {{preparedByName}}</p>\n<p>Date: {{date}}</p>",
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
  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ['/api/quality/qap-templates'],
    throwOnError: false,
    enabled: true,
  });
  
  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof templateFormSchema>) => {
      return apiRequest('/api/quality/qap-templates', 'POST', values);
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
      return apiRequest(`/api/quality/qap-templates/${selectedTemplate.id}`, 'PUT', values);
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
      return apiRequest(`/api/quality/qap-templates/${id}`, 'DELETE');
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
    <!-- Header Section -->
    <div class="itp-header">
      <table width="100%" border="1" cellpadding="3" cellspacing="0">
        <tr>
          <td colspan="6" align="center" style="background-color: #f5f5f5;"><h2>INSPECTION TEST PLAN (ITP)</h2></td>
        </tr>
        <tr>
          <td width="25%" style="vertical-align: top;"><strong>MANUFACTURER:</strong><br/>{{manufacturerName}}<br/>{{manufacturerAddress}}</td>
          <td width="25%" style="vertical-align: top;"><strong>CUSTOMER:</strong><br/>{{customerName}}<br/>{{customerAddress}}</td>
          <td width="16%" style="vertical-align: top;"><strong>PROJECT:</strong><br/>{{projectName}}</td>
          <td width="16%" style="vertical-align: top;"><strong>EQUIPMENT:</strong><br/>{{equipmentName}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top;"><strong>PO NO.</strong><br/>{{poNumber}}</td>
          <td style="vertical-align: top;"><strong>DRAWING NO</strong><br/>{{drawingNumber}}</td>
          <td style="vertical-align: top;"><strong>ITP NO</strong><br/>{{itpNumber}}</td>
          <td style="vertical-align: top;"><strong>REVISION</strong><br/>{{revision}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top;"><strong>ITP DATE</strong><br/>{{itpDate}}</td>
          <td style="vertical-align: top;"><strong>Design Verification No & Date</strong><br/>{{designVerificationInfo}}</td>
          <td style="vertical-align: top;"><strong>ITP REVISION</strong><br/>{{itpRevision}}</td>
          <td style="vertical-align: top;"><strong>QTY</strong><br/>{{quantity}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top;"><strong>NOTIFIED BODY</strong><br/>{{notifiedBody}}</td>
          <td style="vertical-align: top;"><strong>Hazard Level</strong><br/>{{hazardLevel}}</td>
          <td colspan="2" style="vertical-align: top;"><strong>Applicable Standards</strong><br/>{{applicableStandards}}</td>
        </tr>
      </table>
    </div>
    
    <!-- Main Inspection Table -->
    <div class="itp-inspection-table">
      <table width="100%" border="1" cellpadding="3" cellspacing="0">
        <tr>
          <th width="5%" style="background-color: #f5f5f5;">SL.NO</th>
          <th width="20%" style="background-color: #f5f5f5;">INSPECTION ACTIVITY / ITEM</th>
          <th width="15%" style="background-color: #f5f5f5;">CHARACTERISTICS CHECKED</th>
          <th width="15%" style="background-color: #f5f5f5;">REFERENCE DOCUMENTS</th>
          <th width="15%" style="background-color: #f5f5f5;">ACCEPTANCE CRITERIA</th>
          <th width="10%" style="background-color: #f5f5f5;">FORMAT OF RECORDS</th>
          <th width="10%" style="background-color: #f5f5f5;">INSPECTION BY</th>
          <th width="10%" style="background-color: #f5f5f5;">REMARKS</th>
        </tr>
        <tr>
          <td align="center">1</td>
          <td colspan="7" class="section-header"><strong>REVIEW OF DOCUMENTS</strong></td>
        </tr>
        <tr>
          <td align="center">1.1</td>
          <td>Design & Drawings</td>
          <td>Review & approval</td>
          <td>Design & drawing</td>
          <td>Design Verification by notified body</td>
          <td>Design Verification certificate</td>
          <td align="center">P<br/>R/H</td>
          <td>DV certificate No.{{dvCertificateNo}}</td>
        </tr>
        <tr>
          <td align="center">1.2</td>
          <td>Approval of Inspection Test Plan (ITP)</td>
          <td>Review & approval</td>
          <td>Drawing, EN13445-3&5, ACOP</td>
          <td>Compliance to Drawing, EN13445-3 & 5, ACOP</td>
          <td>Inspection Test Plan</td>
          <td align="center">P<br/>R/A</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">1.3</td>
          <td>WPS/PQR/WPQ & weld plan</td>
          <td>Review & approval</td>
          <td>WPS, PQR, WPQ & Weld plan</td>
          <td>Compliance to EN287(EN 9606) & EN288, Weld Sketch</td>
          <td>WPS/PQR/WPQ & weld plan</td>
          <td align="center">P<br/>W/A</td>
          <td>EN 287 REPLACED BY EN 9606</td>
        </tr>
        
        <tr>
          <td align="center">2</td>
          <td colspan="7" class="section-header"><strong>MATERIALS</strong></td>
        </tr>
        <tr>
          <td align="center">2.1</td>
          <td>Material for pressure parts such as Shell, Dished end, RF pad etc.</td>
          <td>Physical, Chem., dimensional & visual</td>
          <td>Drawing, ASME SECT.II, EN10204</td>
          <td>Compliance to specification of drawing & ASME standards</td>
          <td>IR / MTC (3.1)/ Lab Test(3.2)</td>
          <td align="center">P<br/>R/W</td>
          <td>Check testing as required</td>
        </tr>
        <tr>
          <td align="center">2.2</td>
          <td>Pipes for all Nozzles</td>
          <td>Physical, Chem., dimensional & visual</td>
          <td>Drawing, ASME SECT.II, EN10204</td>
          <td>Compliance to specification of drawing & ASME standards</td>
          <td>IR / MTC (3.1)/ Lab Test(3.2)</td>
          <td align="center">P<br/>R/W</td>
          <td>Check testing as required</td>
        </tr>
        
        <tr>
          <td align="center">3</td>
          <td colspan="7" class="section-header"><strong>IN PROCESS INSPECTION</strong></td>
        </tr>
        <tr>
          <td align="center">3.1</td>
          <td>Identification of material and witnessing stamp transfer of identification marks</td>
          <td>Identification of heat no, w.r.t Marking TC</td>
          <td>Approved Drawing, cutting layout, IR</td>
          <td>Approved Drawing, cutting layout, IR</td>
          <td>Joint Inspection report</td>
          <td align="center">P<br/>W</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3.2</td>
          <td>Dimensional Check of component parts</td>
          <td>Dimensional</td>
          <td>Approved Drawing</td>
          <td>As per drawing</td>
          <td>IR</td>
          <td align="center">P<br/>R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3.3</td>
          <td>Fit up for welding</td>
          <td>Dimensional, Visual</td>
          <td>Approved Drawing, WPS</td>
          <td>As per drawing & WPS</td>
          <td>IR</td>
          <td align="center">P<br/>R</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">3.4</td>
          <td>Visual & dimensional inspection after welding</td>
          <td>Visual, Dimensional</td>
          <td>Approved Drawing, ASME Sec VIII Div 1</td>
          <td>As per drawing, ASME Sec VIII</td>
          <td>IR</td>
          <td align="center">P<br/>W</td>
          <td></td>
        </tr>
        
        <tr>
          <td align="center">4</td>
          <td colspan="7" class="section-header"><strong>FINAL INSPECTION</strong></td>
        </tr>
        <tr>
          <td align="center">4.1</td>
          <td>Final dimensional inspection</td>
          <td>Dimensional</td>
          <td>Approved Drawing</td>
          <td>As per drawing</td>
          <td>Dimensional IR</td>
          <td align="center">P<br/>R/W</td>
          <td></td>
        </tr>
        <tr>
          <td align="center">4.2</td>
          <td>Hydrotest</td>
          <td>Visual, Pressure, Time</td>
          <td>Approved Drawing, ASME Sec VIII, Test procedure</td>
          <td>No leakage, No permanent deformation</td>
          <td>Hydrotest report</td>
          <td align="center">P<br/>W</td>
          <td>Test pressure: {{testPressure}}</td>
        </tr>
        <tr>
          <td align="center">4.3</td>
          <td>Final visual inspection & documentation review</td>
          <td>Visual, Documentation</td>
          <td>All applicable codes & standards</td>
          <td>As per applicable codes & standards</td>
          <td>IR</td>
          <td align="center">P<br/>R/W</td>
          <td></td>
        </tr>
      </table>
    </div>
    
    <!-- Legend and Signature Section -->
    <div class="itp-footer">
      <table width="100%" border="1" cellpadding="3" cellspacing="0">
        <tr>
          <td colspan="5" style="background-color: #f5f5f5;"><strong>LEGEND:</strong></td>
        </tr>
        <tr>
          <td width="10%">P</td>
          <td width="30%">Perform</td>
          <td width="10%">R</td>
          <td width="30%">Review</td>
          <td width="20%" rowspan="4">NOTE: The supplier/vendor shall not proceed to the next stage unless the hold points are cleared by the concerned Inspector</td>
        </tr>
        <tr>
          <td>H</td>
          <td>Hold Point (Do not proceed without clearance)</td>
          <td>W</td>
          <td>Witness</td>
        </tr>
        <tr>
          <td>MFR</td>
          <td>Manufacturer</td>
          <td>TPI</td>
          <td>Third Party Inspector</td>
        </tr>
        <tr>
          <td>A</td>
          <td>Approval</td>
          <td>CLI</td>
          <td>Client</td>
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
    .itp-container {
      font-family: Arial, sans-serif;
      margin: 20px;
      font-size: 11pt;
    }
    .itp-header, .itp-inspection-table, .itp-footer {
      margin-bottom: 20px;
    }
    .itp-header h2 {
      font-size: 16pt;
      font-weight: bold;
      margin: 0;
      padding: 8px 0;
      text-align: center;
    }
    .section-header {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: center;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    table, th, td {
      border: 1px solid #000;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
      padding: 6px;
      text-align: center;
      vertical-align: middle;
    }
    td {
      padding: 6px;
      vertical-align: top;
    }
    strong {
      font-weight: bold;
    }
    .inspection-by-cell {
      text-align: center;
      line-height: 1.5;
    }
    /* Print-friendly styles */
    @media print {
      .itp-container {
        margin: 0;
        padding: 0;
        font-size: 10pt;
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