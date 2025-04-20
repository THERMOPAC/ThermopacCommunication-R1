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
      <table width="100%" border="1" cellpadding="5" cellspacing="0">
        <tr>
          <td colspan="4" align="center"><h2>INSPECTION AND TEST PLAN</h2></td>
        </tr>
        <tr>
          <td width="25%"><strong>Manufacturer:</strong></td>
          <td width="25%">{{manufacturerName}}</td>
          <td width="25%"><strong>Customer:</strong></td>
          <td width="25%">{{customerName}}</td>
        </tr>
        <tr>
          <td><strong>Project:</strong></td>
          <td>{{projectName}}</td>
          <td><strong>P.O. No:</strong></td>
          <td>{{poNumber}}</td>
        </tr>
        <tr>
          <td><strong>Equipment:</strong></td>
          <td>{{equipmentName}}</td>
          <td><strong>Drawing No:</strong></td>
          <td>{{drawingNumber}}</td>
        </tr>
        <tr>
          <td><strong>ITP No:</strong></td>
          <td>{{itpNumber}}</td>
          <td><strong>Revision:</strong></td>
          <td>{{revision}}</td>
        </tr>
        <tr>
          <td><strong>Applicable Standards:</strong></td>
          <td colspan="3">{{applicableStandards}}</td>
        </tr>
      </table>
    </div>
    
    <!-- Main Inspection Table -->
    <div class="itp-inspection-table">
      <table width="100%" border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th width="5%">S.No</th>
          <th width="15%">Activity Description</th>
          <th width="15%">Characteristics</th>
          <th width="15%">Reference Documents</th>
          <th width="15%">Acceptance Criteria</th>
          <th width="15%">Record Format</th>
          <th width="15%">Inspection Responsibility</th>
          <th width="5%">Remarks</th>
        </tr>
        <!-- Raw Material Inspection -->
        <tr>
          <td colspan="8" class="section-header">Raw Material Inspection</td>
        </tr>
        <tr>
          <td>1</td>
          <td>Material Verification</td>
          <td>Material Certificate</td>
          <td>Drawing, P.O.</td>
          <td>As per specification</td>
          <td>MTC</td>
          <td>MFR</td>
          <td></td>
        </tr>
        
        <!-- In-Process Inspection -->
        <tr>
          <td colspan="8" class="section-header">In-Process Inspection</td>
        </tr>
        <tr>
          <td>2</td>
          <td>Dimensional Check</td>
          <td>Dimensions</td>
          <td>Drawing</td>
          <td>As per drawing</td>
          <td>QC Report</td>
          <td>MFR</td>
          <td></td>
        </tr>
        <tr>
          <td>3</td>
          <td>Welding Procedure Qualification</td>
          <td>WPS, PQR</td>
          <td>ASME Sec IX</td>
          <td>ASME Sec IX</td>
          <td>WPS, PQR</td>
          <td>MFR, TPI</td>
          <td></td>
        </tr>
        
        <!-- Final Inspection -->
        <tr>
          <td colspan="8" class="section-header">Final Inspection</td>
        </tr>
        <tr>
          <td>4</td>
          <td>Final Dimensional Check</td>
          <td>Overall Dimensions</td>
          <td>Drawing</td>
          <td>As per drawing</td>
          <td>QC Report</td>
          <td>MFR, TPI</td>
          <td></td>
        </tr>
        <tr>
          <td>5</td>
          <td>Pressure Test</td>
          <td>Pressure Rating</td>
          <td>Test Procedure</td>
          <td>No leakage</td>
          <td>Test Report</td>
          <td>MFR, TPI, CLI</td>
          <td></td>
        </tr>
      </table>
    </div>
    
    <!-- Legend and Signature Section -->
    <div class="itp-footer">
      <table width="100%" border="1" cellpadding="5" cellspacing="0">
        <tr>
          <td colspan="2"><strong>Legend:</strong></td>
        </tr>
        <tr>
          <td width="25%">MFR</td>
          <td>Manufacturer</td>
        </tr>
        <tr>
          <td>TPI</td>
          <td>Third Party Inspector</td>
        </tr>
        <tr>
          <td>CLI</td>
          <td>Client</td>
        </tr>
      </table>
      
      <table width="100%" border="1" cellpadding="5" cellspacing="0" style="margin-top: 20px;">
        <tr>
          <td width="33%"><strong>Prepared By:</strong></td>
          <td width="33%"><strong>Reviewed By:</strong></td>
          <td width="34%"><strong>Approved By:</strong></td>
        </tr>
        <tr>
          <td height="50"></td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>{{preparedBy}}</td>
          <td>{{reviewedBy}}</td>
          <td>{{approvedBy}}</td>
        </tr>
        <tr>
          <td>{{preparedDate}}</td>
          <td>{{reviewedDate}}</td>
          <td>{{approvedDate}}</td>
        </tr>
      </table>
    </div>
  </div>
  
  <style>
    .itp-container {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    .itp-header, .itp-inspection-table, .itp-footer {
      margin-bottom: 20px;
    }
    .section-header {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: center;
    }
    table {
      border-collapse: collapse;
    }
    th {
      background-color: #f2f2f2;
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
                <Label>Template Preview</Label>
                <Card className="mt-1 p-4 overflow-auto max-h-[500px]">
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