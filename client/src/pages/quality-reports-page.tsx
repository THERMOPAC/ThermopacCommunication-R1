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
      return apiRequest('/api/quality/qap-templates', {
        method: 'POST',
        body: JSON.stringify(values),
      });
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
      return apiRequest(`/api/quality/qap-templates/${selectedTemplate.id}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      });
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
      return apiRequest(`/api/quality/qap-templates/${id}`, {
        method: 'DELETE',
      });
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
                      Use placeholders like {{title}}, {{projectName}}, etc. for dynamic content.
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
                      Use placeholders like {{title}}, {{projectName}}, etc. for dynamic content.
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

// Generated QAPs Tab
function GeneratedQAPsTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedQAP, setSelectedQAP] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const { toast } = useToast();
  const { user } = useAuth();
  
  // QAP schema
  const qapFormSchema = z.object({
    title: z.string().min(1, "Title is required"),
    projectId: z.string().min(1, "Project is required"),
    templateId: z.string().min(1, "Template is required"),
    clientName: z.string().min(1, "Client name is required"),
    equipmentType: z.string().min(1, "Equipment type is required"),
    standards: z.string().optional(),
    revision: z.string().min(1, "Revision is required"),
    itpReferences: z.string().optional(),
    content: z.string().optional(),
  });
  
  // Form setup
  const form = useForm<z.infer<typeof qapFormSchema>>({
    resolver: zodResolver(qapFormSchema),
    defaultValues: {
      title: "",
      projectId: "",
      templateId: "",
      clientName: "",
      equipmentType: "",
      standards: "",
      revision: "A",
      itpReferences: "",
      content: "",
    },
  });
  
  // Fetch projects
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
    throwOnError: false,
    enabled: true,
  });
  
  // Fetch templates
  const { data: templates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['/api/quality/qap-templates'],
    throwOnError: false,
    enabled: true,
  });
  
  // Fetch selected template content when template changes
  const watchTemplateId = form.watch("templateId");
  
  useEffect(() => {
    if (watchTemplateId) {
      const selectedTemplate = templates?.find((t: any) => t.id === parseInt(watchTemplateId));
      if (selectedTemplate) {
        form.setValue("content", selectedTemplate.content);
      }
    }
  }, [watchTemplateId, templates, form]);
  
  // Query generated QAPs with optional project filter
  const { data: qaps, isLoading, refetch } = useQuery({
    queryKey: ['/api/quality/generated-qaps', selectedProject],
    queryFn: async () => {
      const url = selectedProject && selectedProject !== 'all'
        ? `/api/quality/generated-qaps?projectId=${selectedProject}` 
        : '/api/quality/generated-qaps';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch QAPs');
      }
      return response.json();
    },
    throwOnError: false,
    enabled: true,
  });
  
  // Create QAP mutation
  const createQAPMutation = useMutation({
    mutationFn: async (values: z.infer<typeof qapFormSchema>) => {
      return apiRequest('/api/quality/generated-qaps', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      toast({
        title: "QAP created",
        description: "Quality Assurance Plan has been created successfully",
      });
      setIsCreateDialogOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create QAP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle QAP creation
  const onSubmit = (values: z.infer<typeof qapFormSchema>) => {
    createQAPMutation.mutate(values);
  };
  
  // Handle view QAP
  const handleViewQAP = async (qapId: number) => {
    try {
      const response = await fetch(`/api/quality/generated-qaps/${qapId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch QAP details');
      }
      const data = await response.json();
      setSelectedQAP(data);
      setIsViewDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load QAP details",
        variant: "destructive",
      });
    }
  };
  
  // Handle export QAP as PDF
  const handleExportQAP = (qapId: number) => {
    // Open in a new window/tab to display the HTML that can be printed as PDF
    window.open(`/api/quality/generated-qaps/${qapId}/export`, '_blank');
  };
  
  // Handle delete QAP
  const handleDeleteQAP = async (qapId: number) => {
    if (window.confirm("Are you sure you want to delete this QAP? This action cannot be undone.")) {
      try {
        const response = await fetch(`/api/quality/generated-qaps/${qapId}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete QAP');
        }
        
        toast({
          title: "QAP deleted",
          description: "Quality Assurance Plan has been deleted successfully",
        });
        
        refetch();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete QAP",
          variant: "destructive",
        });
      }
    }
  };
  
  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "in_review":
        return <Badge variant="secondary">In Review</Badge>;
      case "approved":
        return <Badge className="bg-green-500 text-white">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Quality Assurance Plans</h2>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Generate QAP
        </Button>
      </div>
      
      <div className="flex items-center space-x-4 mb-4">
        <Label htmlFor="project-filter" className="whitespace-nowrap">Filter by project:</Label>
        <Select 
          value={selectedProject} 
          onValueChange={setSelectedProject}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects?.map((project: any) => (
              <SelectItem key={project.id} value={project.id.toString()}>
                {project.code} - {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : qaps?.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No quality assurance plans found. Generate one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>QAP Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Revision</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prepared By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qaps?.map((qap: any) => (
              <TableRow key={qap.id}>
                <TableCell className="font-medium">QAP-{qap.id.toString().padStart(3, '0')}</TableCell>
                <TableCell>{qap.title}</TableCell>
                <TableCell>{qap.project?.code || 'Unknown'}</TableCell>
                <TableCell>{qap.clientName}</TableCell>
                <TableCell>{qap.revision}</TableCell>
                <TableCell>{getStatusBadge(qap.status)}</TableCell>
                <TableCell>{qap.preparedByUser?.username || 'Unknown'}</TableCell>
                <TableCell>{format(new Date(qap.createdAt), 'MMM dd, yyyy')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleViewQAP(qap.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleExportQAP(qap.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {(user?.role === "Superuser" || qap.preparedByUser?.id === user?.id) && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteQAP(qap.id)}
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
      
      {/* Create QAP Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Quality Assurance Plan</DialogTitle>
            <DialogDescription>
              Create a new QAP based on a template and project details.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>QAP Title</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Heat Exchanger Quality Assurance Plan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingProjects ? (
                            <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                          ) : (
                            projects?.map((project: any) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.code} - {project.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingTemplates ? (
                            <SelectItem value="loading" disabled>Loading templates...</SelectItem>
                          ) : (
                            templates?.map((template: any) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name} (v{template.version})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Client company name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="equipmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Type</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., Heat Exchanger, Pressure Vessel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="standards"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standards</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g., ASME Section VIII, ISO 9001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="revision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revision</FormLabel>
                      <FormControl>
                        <Input placeholder="A" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="itpReferences"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ITP References (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Reference to related Inspection & Test Plans" {...field} />
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
                    <FormLabel>QAP Content</FormLabel>
                    <FormDescription>
                      This content is automatically loaded from the selected template. You can modify it if needed.
                    </FormDescription>
                    <FormControl>
                      <Textarea 
                        placeholder="Content will be loaded from template" 
                        className="min-h-[200px] font-mono text-sm"
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
                <Button type="submit" disabled={createQAPMutation.isPending}>
                  {createQAPMutation.isPending ? "Generating..." : "Generate QAP"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View QAP Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              QAP-{selectedQAP?.id?.toString().padStart(3, '0')}: {selectedQAP?.title}
            </DialogTitle>
            <DialogDescription>
              Project: {selectedQAP?.project?.code} - {selectedQAP?.project?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium">Client</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.clientName}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Equipment Type</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.equipmentType}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Standards</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.standards || 'N/A'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Revision</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.revision}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Status</h3>
                <p className="text-muted-foreground mt-1">{getStatusBadge(selectedQAP?.status)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">ITP References</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.itpReferences || 'N/A'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Prepared By</h3>
                <p className="text-muted-foreground mt-1">{selectedQAP?.preparedByUser?.username || 'Unknown'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium">Date</h3>
                <p className="text-muted-foreground mt-1">
                  {selectedQAP?.createdAt ? format(new Date(selectedQAP.createdAt), 'MMM dd, yyyy') : 'Unknown'}
                </p>
              </div>
            </div>
            
            {selectedQAP?.versions && selectedQAP.versions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Version History</h3>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Revision</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedQAP.versions.map((version: any) => (
                        <TableRow key={version.id}>
                          <TableCell>{version.version}</TableCell>
                          <TableCell>{version.revision}</TableCell>
                          <TableCell>{version.createdByUser?.username || 'Unknown'}</TableCell>
                          <TableCell>
                            {version.createdAt ? format(new Date(version.createdAt), 'MMM dd, yyyy') : 'Unknown'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium">QAP Preview</h3>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleExportQAP(selectedQAP.id)}
                  className="flex items-center"
                >
                  <Printer className="h-4 w-4 mr-1" /> Export PDF
                </Button>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-md border overflow-auto max-h-[500px]">
                <div dangerouslySetInnerHTML={{ __html: selectedQAP?.content || '' }} />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Main Quality Reports page
// ITP Management Tab
function ITPManagementTab() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedITP, setSelectedITP] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // ITP schema
  const itpFormSchema = z.object({
    title: z.string().min(1, "Title is required"),
    projectId: z.number({
      required_error: "Project is required",
      invalid_type_error: "Project is required",
    }),
    equipmentName: z.string().min(1, "Equipment name is required"),
    drawingNumber: z.string().optional(),
    revision: z.string().min(1, "Revision is required"),
    hazardLevel: z.string().optional(),
    notifiedBody: z.string().optional(),
    qapId: z.number().optional(),
    templateId: z.number().optional(),
    content: z.any().optional(),
  });
  
  // Form setup
  const form = useForm<z.infer<typeof itpFormSchema>>({
    resolver: zodResolver(itpFormSchema),
    defaultValues: {
      title: "",
      projectId: undefined,
      equipmentName: "",
      drawingNumber: "",
      revision: "R0",
      hazardLevel: "Low",
      notifiedBody: "",
      qapId: undefined,
      templateId: undefined,
      content: {},
    },
  });
  
  // Edit form setup
  const editForm = useForm<z.infer<typeof itpFormSchema>>({
    resolver: zodResolver(itpFormSchema),
    defaultValues: {
      title: "",
      projectId: undefined,
      equipmentName: "",
      drawingNumber: "",
      revision: "",
      hazardLevel: "",
      notifiedBody: "",
      qapId: undefined,
      templateId: undefined,
      content: {},
    },
  });
  
  // Query ITPs
  const { data: itps, isLoading, refetch } = useQuery({
    queryKey: ['/api/quality/itps'],
    throwOnError: false,
    enabled: true,
  });
  
  // Query projects for dropdown
  const { data: projects } = useQuery({
    queryKey: ['/api/projects'],
    throwOnError: false,
    enabled: true,
  });
  
  // Query QAPs for dropdown
  const { data: qaps } = useQuery({
    queryKey: ['/api/quality/generated-qaps'],
    throwOnError: false,
    enabled: true,
  });
  
  // Query ITP templates for dropdown
  const { data: templates } = useQuery({
    queryKey: ['/api/quality/itp-templates'],
    throwOnError: false,
    enabled: true,
  });
  
  // Create ITP mutation
  const createITPMutation = useMutation({
    mutationFn: async (values: z.infer<typeof itpFormSchema>) => {
      return apiRequest('/api/quality/itps', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      toast({
        title: "ITP created",
        description: "Inspection and Test Plan has been created successfully",
      });
      setIsCreateDialogOpen(false);
      form.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create ITP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Update ITP mutation
  const updateITPMutation = useMutation({
    mutationFn: async (values: z.infer<typeof itpFormSchema>) => {
      return apiRequest(`/api/quality/itps/${selectedITP.id}`, {
        method: 'PUT',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      toast({
        title: "ITP updated",
        description: "Inspection and Test Plan has been updated successfully",
      });
      setIsEditDialogOpen(false);
      editForm.reset();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update ITP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
  
  // Delete ITP mutation
  const deleteITPMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/quality/itps/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({
        title: "ITP deleted",
        description: "Inspection and Test Plan has been deleted successfully",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete ITP",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // Handle ITP creation
  const onSubmit = (values: z.infer<typeof itpFormSchema>) => {
    createITPMutation.mutate(values);
  };
  
  // Handle ITP update
  const onUpdate = (values: z.infer<typeof itpFormSchema>) => {
    updateITPMutation.mutate(values);
  };
  
  // Handle view ITP
  const handleViewITP = (itp: any) => {
    setSelectedITP(itp);
    setIsViewDialogOpen(true);
  };
  
  // Handle edit ITP
  const handleEditITP = (itp: any) => {
    setSelectedITP(itp);
    editForm.reset({
      title: itp.title,
      projectId: itp.projectId,
      equipmentName: itp.equipmentName,
      drawingNumber: itp.drawingNumber || "",
      revision: itp.revision,
      hazardLevel: itp.hazardLevel || "Low",
      notifiedBody: itp.notifiedBody || "",
      qapId: itp.qapId,
      templateId: itp.templateId,
      content: itp.content || {},
    });
    setIsEditDialogOpen(true);
  };
  
  // Handle delete ITP
  const handleDeleteITP = (id: number) => {
    if (window.confirm("Are you sure you want to delete this ITP? This action cannot be undone.")) {
      deleteITPMutation.mutate(id);
    }
  };
  
  // Handle export ITP
  const handleExportITP = (itp: any) => {
    window.open(`/api/quality/itps/${itp.id}/export`);
  };
  
  // Handle template selection for content population
  const handleTemplateChange = (templateId: number) => {
    const template = templates?.find((t: any) => t.id === templateId);
    if (template) {
      form.setValue('content', template.content);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inspection and Test Plans</h2>
        {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager" || user?.role === "Employee") && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create ITP
          </Button>
        )}
      </div>
      
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : itps?.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No Inspection and Test Plans found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Drawing No.</TableHead>
              <TableHead>Revision</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itps?.map((itp: any) => (
              <TableRow key={itp.id}>
                <TableCell className="font-medium">{itp.title}</TableCell>
                <TableCell>{itp.project?.name || 'Unknown'}</TableCell>
                <TableCell>{itp.equipmentName}</TableCell>
                <TableCell>{itp.drawingNumber || '-'}</TableCell>
                <TableCell>{itp.revision}</TableCell>
                <TableCell>
                  <Badge variant={itp.status === "approved" ? "success" : itp.status === "in_review" ? "warning" : "default"}>
                    {itp.status === "approved" ? "Approved" : itp.status === "in_review" ? "In Review" : "Draft"}
                  </Badge>
                </TableCell>
                <TableCell>{itp.preparedByUser?.username || 'Unknown'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewITP(itp)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(user?.role === "Superuser" || user?.role === "Manager" || user?.role === "Senior Manager" || user?.role === "General Manager" || user?.id === itp.preparedBy) && (
                      <Button variant="outline" size="sm" onClick={() => handleEditITP(itp)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleExportITP(itp)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {user?.role === "Superuser" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteITP(itp.id)}
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
      
      {/* Create ITP Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Inspection and Test Plan</DialogTitle>
            <DialogDescription>
              Create a new ITP linked to a project, QAP, and optional template.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ITP Title</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Pressure Vessel Inspection Plan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projects?.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.code} - {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="equipmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Equipment or system name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="drawingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drawing Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional drawing number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="revision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revision</FormLabel>
                      <FormControl>
                        <Input placeholder="R0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="hazardLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hazard Level</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select hazard level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notifiedBody"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notified Body (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="External inspection body" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="qapId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>QAP Reference (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a QAP" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {qaps?.map((qap: any) => (
                            <SelectItem key={qap.id} value={qap.id.toString()}>
                              {qap.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ITP Template (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const templateId = value ? parseInt(value) : undefined;
                          field.onChange(templateId);
                          if (templateId) handleTemplateChange(templateId);
                        }}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {templates?.map((template: any) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name} (v{template.version})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select a template to pre-populate the ITP structure
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createITPMutation.isPending}>
                  {createITPMutation.isPending ? "Creating..." : "Create ITP"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* View ITP Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedITP?.title}</DialogTitle>
            <DialogDescription>
              Revision {selectedITP?.revision} - Created by {selectedITP?.preparedByUser?.username || 'Unknown'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="font-medium">Project:</label>
                <div>{selectedITP?.project?.name} ({selectedITP?.project?.code})</div>
              </div>
              <div>
                <label className="font-medium">Equipment:</label>
                <div>{selectedITP?.equipmentName}</div>
              </div>
              <div>
                <label className="font-medium">Drawing Number:</label>
                <div>{selectedITP?.drawingNumber || 'N/A'}</div>
              </div>
              <div>
                <label className="font-medium">Hazard Level:</label>
                <div>{selectedITP?.hazardLevel || 'Not specified'}</div>
              </div>
              <div>
                <label className="font-medium">Status:</label>
                <div>
                  <Badge variant={selectedITP?.status === "approved" ? "success" : selectedITP?.status === "in_review" ? "warning" : "default"}>
                    {selectedITP?.status === "approved" ? "Approved" : selectedITP?.status === "in_review" ? "In Review" : "Draft"}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="font-medium">Template:</label>
                <div>{selectedITP?.template?.name || 'Custom'}</div>
              </div>
              <div>
                <label className="font-medium">QAP Reference:</label>
                <div>{selectedITP?.qap?.title || 'N/A'}</div>
              </div>
              <div>
                <label className="font-medium">Version:</label>
                <div>{selectedITP?.version || '1'}</div>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-sm font-medium mb-2">Activities</h3>
              {selectedITP?.activities?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Acceptance Criteria</TableHead>
                      <TableHead>Responsibility</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedITP?.activities?.map((activity: any) => (
                      <TableRow key={activity.id}>
                        <TableCell>{activity.sequenceNumber}</TableCell>
                        <TableCell>{activity.description}</TableCell>
                        <TableCell>{activity.acceptanceCriteria}</TableCell>
                        <TableCell>{activity.responsibility}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">No activities defined for this ITP.</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => handleExportITP(selectedITP)}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit ITP Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Inspection and Test Plan</DialogTitle>
            <DialogDescription>
              Update the ITP details and structure.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-6">
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ITP Title</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g., Pressure Vessel Inspection Plan" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={editForm.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projects?.map((project: any) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.code} - {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="equipmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Equipment or system name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={editForm.control}
                  name="drawingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drawing Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional drawing number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="revision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revision</FormLabel>
                      <FormControl>
                        <Input placeholder="R0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={editForm.control}
                  name="hazardLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hazard Level</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select hazard level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="notifiedBody"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notified Body (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="External inspection body" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={editForm.control}
                  name="qapId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>QAP Reference (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a QAP" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {qaps?.map((qap: any) => (
                            <SelectItem key={qap.id} value={qap.id.toString()}>
                              {qap.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ITP Template (Optional)</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const templateId = value ? parseInt(value) : undefined;
                          field.onChange(templateId);
                          if (templateId) handleTemplateChange(templateId);
                        }}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {templates?.map((template: any) => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name} (v{template.version})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Changing the template may replace existing content
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateITPMutation.isPending}>
                  {updateITPMutation.isPending ? "Updating..." : "Update ITP"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function QualityReportsPage() {
  const { user } = useAuth();
  const canManageQuality = user?.role === "Superuser" || user?.role === "Manager" || 
                           user?.role === "Senior Manager" || user?.role === "General Manager";

  return (
    <Layout>
      <Helmet>
        <title>Quality Management | Thermopac</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Quality Management</h1>
        </div>

        <Tabs defaultValue="qaps" className="space-y-6">
          <TabsList>
            <TabsTrigger value="qaps">QAP Generator</TabsTrigger>
            {canManageQuality && <TabsTrigger value="templates">QAP Templates</TabsTrigger>}
            {canManageQuality && <TabsTrigger value="itps">ITP Management</TabsTrigger>}
            <TabsTrigger value="reports">Quality Metrics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="qaps" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quality Assurance Plans</CardTitle>
                <CardDescription>
                  Generate, manage, and export QAP documents for your projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GeneratedQAPsTab />
              </CardContent>
            </Card>
          </TabsContent>
          
          {canManageQuality && (
            <TabsContent value="templates" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>QAP Templates</CardTitle>
                  <CardDescription>
                    Manage reusable templates for quality assurance plans
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <QAPTemplatesTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}
          
          {canManageQuality && (
            <TabsContent value="itps" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Inspection and Test Plans</CardTitle>
                  <CardDescription>
                    Create and manage ITPs linked to QAPs and projects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ITPManagementTab />
                </CardContent>
              </Card>
            </TabsContent>
          )}
          
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics Dashboard</CardTitle>
                <CardDescription>
                  View and analyze quality metrics, reports, and compliance documentation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <div className="text-center">
                    <h3 className="text-lg font-medium">Quality Metrics Dashboard</h3>
                    <p className="text-muted-foreground mt-2">
                      This feature is coming soon! Check back later for advanced quality analytics.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}