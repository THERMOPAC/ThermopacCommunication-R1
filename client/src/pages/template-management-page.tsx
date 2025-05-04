import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/layout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Settings, FileText, Eye, LayoutTemplate, ArrowUpDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { TemplateSectionType, templateSectionTypes, templateFontSizes } from '@shared/schema';

// Interface for the template data from API
interface Template {
  id: number;
  name: string;
  type: string;
  hasCoverPage: boolean;
  hasFooter: boolean;
  fontSize: string;
  headerText: string | null;
  footerText: string | null;
  sectionOrder: TemplateSectionType[] | null;
  isDefault: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

// Form schema for template creation/editing
const templateFormSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  type: z.string().default('QMS Final Dossier'),
  hasCoverPage: z.boolean().default(true),
  hasFooter: z.boolean().default(true),
  fontSize: z.enum(['Small', 'Medium', 'Large']).default('Medium'),
  headerText: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  sectionOrder: z.array(z.enum(templateSectionTypes)).optional(),
  isDefault: z.boolean().default(false),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

export default function TemplateManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [draggedSection, setDraggedSection] = useState<TemplateSectionType | null>(null);
  
  // Set up form for creating templates
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      type: 'QMS Final Dossier',
      hasCoverPage: true,
      hasFooter: true,
      fontSize: 'Medium',
      headerText: '',
      footerText: '',
      sectionOrder: ['Material Traceability', 'Welding & Weld Maps', 'NDT', 'Visual Inspection', 'Hydrotest', 'Non-Conformance'],
      isDefault: false,
    },
  });
  
  // Set up form for editing templates
  const editForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      type: 'QMS Final Dossier',
      hasCoverPage: true,
      hasFooter: true,
      fontSize: 'Medium',
      headerText: '',
      footerText: '',
      sectionOrder: ['Material Traceability', 'Welding & Weld Maps', 'NDT', 'Visual Inspection', 'Hydrotest', 'Non-Conformance'],
      isDefault: false,
    },
  });
  
  // Fetch all templates
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      return response.json() as Promise<Template[]>;
    }
  });
  
  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      return apiRequest('POST', '/api/templates', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: 'Template Created',
        description: 'The template was successfully created.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create template',
        variant: 'destructive',
      });
    },
  });
  
  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: TemplateFormValues }) => {
      return apiRequest('PUT', `/api/templates/${id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsEditDialogOpen(false);
      setEditingTemplate(null);
      editForm.reset();
      toast({
        title: 'Template Updated',
        description: 'The template was successfully updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update template',
        variant: 'destructive',
      });
    },
  });
  
  // Set default template mutation
  const setDefaultTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/templates/${id}/set-default`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({
        title: 'Default Template Set',
        description: 'The template was set as default successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to set default template',
        variant: 'destructive',
      });
    },
  });
  
  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({
        title: 'Template Deleted',
        description: 'The template was deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete template',
        variant: 'destructive',
      });
    },
  });
  
  // Handle form submission for creating templates
  const onSubmit = (values: TemplateFormValues) => {
    createTemplateMutation.mutate(values);
  };
  
  // Handle form submission for editing templates
  const onEditSubmit = (values: TemplateFormValues) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, values });
    }
  };
  
  // Handle opening edit dialog and populating form
  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    editForm.reset({
      name: template.name,
      type: template.type,
      hasCoverPage: template.hasCoverPage,
      hasFooter: template.hasFooter,
      fontSize: template.fontSize as any,
      headerText: template.headerText || '',
      footerText: template.footerText || '',
      sectionOrder: template.sectionOrder || [],
      isDefault: template.isDefault,
    });
    setIsEditDialogOpen(true);
  };
  
  // Handle setting a template as default
  const handleSetDefault = (template: Template) => {
    setDefaultTemplateMutation.mutate(template.id);
  };
  
  // Handle deleting a template
  const handleDeleteTemplate = (template: Template) => {
    if (template.isDefault) {
      toast({
        title: 'Cannot Delete Default Template',
        description: 'You cannot delete the default template. Please set another template as default first.',
        variant: 'destructive',
      });
      return;
    }
    
    if (confirm('Are you sure you want to delete this template?')) {
      deleteTemplateMutation.mutate(template.id);
    }
  };
  
  // Handle opening preview dialog
  const handlePreviewTemplate = (template: Template) => {
    setPreviewTemplate(template);
    setIsPreviewDialogOpen(true);
  };
  
  // Handle section drag start
  const handleDragStart = (section: TemplateSectionType) => {
    setDraggedSection(section);
  };
  
  // Handle section drag over
  const handleDragOver = (e: React.DragEvent, targetSection: TemplateSectionType, formContext: any) => {
    e.preventDefault();
    
    if (!draggedSection || draggedSection === targetSection) return;
    
    const sectionOrder = formContext.getValues().sectionOrder || [];
    const newSectionOrder = [...sectionOrder];
    
    const draggedIndex = newSectionOrder.indexOf(draggedSection);
    const targetIndex = newSectionOrder.indexOf(targetSection);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove the dragged section
      newSectionOrder.splice(draggedIndex, 1);
      
      // Insert at the target position
      newSectionOrder.splice(targetIndex, 0, draggedSection);
      
      // Update form values
      formContext.setValue('sectionOrder', newSectionOrder);
    }
  };
  
  // Handle section drag end
  const handleDragEnd = () => {
    setDraggedSection(null);
  };
  
  return (
    <Layout title="Template Management" showBackButton={false}>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Template Management</h1>
            <p className="text-muted-foreground">
              Create and manage document templates for QMS Final Dossier
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" /> Create Template
          </Button>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center p-6 border rounded-md bg-destructive/10 text-destructive">
            <p>Error loading templates: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className={template.isDefault ? 'border-primary' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center">
                        <LayoutTemplate className="h-5 w-5 mr-2 text-primary" />
                        {template.name}
                      </CardTitle>
                      <CardDescription>{template.type}</CardDescription>
                    </div>
                    {template.isDefault && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                        Default
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div className="text-muted-foreground">Cover Page:</div>
                      <div>{template.hasCoverPage ? 'Yes' : 'No'}</div>
                      
                      <div className="text-muted-foreground">Footer:</div>
                      <div>{template.hasFooter ? 'Yes' : 'No'}</div>
                      
                      <div className="text-muted-foreground">Font Size:</div>
                      <div>{template.fontSize}</div>
                    </div>
                    
                    <div className="mt-4">
                      <p className="text-muted-foreground mb-1">Sections:</p>
                      <div className="text-xs space-y-1">
                        {template.sectionOrder && template.sectionOrder.length > 0 ? (
                          template.sectionOrder.map((section, index) => (
                            <div 
                              key={index} 
                              className="px-2 py-1 bg-muted rounded-sm flex items-center"
                            >
                              <span className="text-muted-foreground mr-2">{index + 1}.</span>
                              {section}
                            </div>
                          ))
                        ) : (
                          <p className="text-muted-foreground italic">No sections defined</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEditTemplate(template)}
                    >
                      <Settings className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handlePreviewTemplate(template)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> Preview
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {!template.isDefault && (
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => handleSetDefault(template)}
                      >
                        Set Default
                      </Button>
                    )}
                    {!template.isDefault && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteTemplate(template)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center p-12 border rounded-md">
            <p className="text-muted-foreground mb-4">No templates found. Create your first template to get started.</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" /> Create Template
            </Button>
          </div>
        )}
      </div>
      
      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Create a new template for generating QMS Final Dossier documents.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Information</TabsTrigger>
                  <TabsTrigger value="styling">Layout & Styling</TabsTrigger>
                  <TabsTrigger value="sections">Section Order</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-6 pt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter template name" {...field} />
                        </FormControl>
                        <FormDescription>
                          Give your template a descriptive name.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Default Template</FormLabel>
                          <FormDescription>
                            Make this the default template for generating Final Dossiers.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Layout & Styling Tab */}
                <TabsContent value="styling" className="space-y-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="hasCoverPage"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Include Cover Page</FormLabel>
                            <FormDescription>
                              Add a cover page to the document.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="hasFooter"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Include Footer</FormLabel>
                            <FormDescription>
                              Add a footer to document pages.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="fontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select font size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {templateFontSizes.map((size) => (
                              <SelectItem key={size} value={size}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the font size for the document.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="headerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Header Text</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter header text (optional)" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Custom text to display in the document header.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="footerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer Text</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter footer text (optional)" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Custom text to display in the document footer.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Section Order Tab */}
                <TabsContent value="sections" className="space-y-6 pt-4">
                  <FormField
                    control={form.control}
                    name="sectionOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Order</FormLabel>
                        <FormDescription className="mb-4">
                          Drag and drop sections to reorder them in the document. The sections will appear in the order listed below.
                        </FormDescription>
                        <div className="space-y-2 border rounded-md p-4">
                          {field.value?.map((section, index) => (
                            <div 
                              key={index}
                              className="flex items-center p-2 border rounded-md cursor-move bg-background hover:bg-muted transition-colors"
                              draggable
                              onDragStart={() => handleDragStart(section)}
                              onDragOver={(e) => handleDragOver(e, section, form)}
                              onDragEnd={handleDragEnd}
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span>{index + 1}. {section}</span>
                            </div>
                          ))}
                          
                          {(!field.value || field.value.length === 0) && (
                            <div className="text-center p-4 text-muted-foreground">
                              No sections defined. Please add sections to the template.
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTemplateMutation.isPending}>
                  {createTemplateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Create Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Edit your template for generating QMS Final Dossier documents.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Information</TabsTrigger>
                  <TabsTrigger value="styling">Layout & Styling</TabsTrigger>
                  <TabsTrigger value="sections">Section Order</TabsTrigger>
                </TabsList>
                
                {/* Basic Information Tab */}
                <TabsContent value="basic" className="space-y-6 pt-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter template name" {...field} />
                        </FormControl>
                        <FormDescription>
                          Give your template a descriptive name.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Default Template</FormLabel>
                          <FormDescription>
                            Make this the default template for generating Final Dossiers.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Layout & Styling Tab */}
                <TabsContent value="styling" className="space-y-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={editForm.control}
                      name="hasCoverPage"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Include Cover Page</FormLabel>
                            <FormDescription>
                              Add a cover page to the document.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="hasFooter"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Include Footer</FormLabel>
                            <FormDescription>
                              Add a footer to document pages.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={editForm.control}
                    name="fontSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Font Size</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select font size" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {templateFontSizes.map((size) => (
                              <SelectItem key={size} value={size}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the font size for the document.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="headerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Header Text</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter header text (optional)" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Custom text to display in the document header.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="footerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer Text</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter footer text (optional)" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Custom text to display in the document footer.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Section Order Tab */}
                <TabsContent value="sections" className="space-y-6 pt-4">
                  <FormField
                    control={editForm.control}
                    name="sectionOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Order</FormLabel>
                        <FormDescription className="mb-4">
                          Drag and drop sections to reorder them in the document. The sections will appear in the order listed below.
                        </FormDescription>
                        <div className="space-y-2 border rounded-md p-4">
                          {field.value?.map((section, index) => (
                            <div 
                              key={index}
                              className="flex items-center p-2 border rounded-md cursor-move bg-background hover:bg-muted transition-colors"
                              draggable
                              onDragStart={() => handleDragStart(section)}
                              onDragOver={(e) => handleDragOver(e, section, editForm)}
                              onDragEnd={handleDragEnd}
                            >
                              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                              <span>{index + 1}. {section}</span>
                            </div>
                          ))}
                          
                          {(!field.value || field.value.length === 0) && (
                            <div className="text-center p-4 text-muted-foreground">
                              No sections defined. Please add sections to the template.
                            </div>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTemplateMutation.isPending}>
                  {updateTemplateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Update Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Template Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              Preview of how the document will be structured based on this template.
            </DialogDescription>
          </DialogHeader>
          
          {previewTemplate && (
            <div className="space-y-6">
              <div className="border rounded-md overflow-hidden">
                {/* Cover Page Preview */}
                {previewTemplate.hasCoverPage && (
                  <div className="p-6 border-b bg-muted/30">
                    <div className="text-center space-y-6">
                      <h2 className="text-xl font-bold text-center">QUALITY MANAGEMENT SYSTEM</h2>
                      <div className="py-8">
                        <h1 className="text-2xl font-bold">FINAL DOCUMENTATION DOSSIER</h1>
                        <p className="mt-2">Project: [Project Name]</p>
                        <p>Inspection Order: [IO Number]</p>
                      </div>
                      
                      <div className="pt-8">
                        <p>Generated with template: {previewTemplate.name}</p>
                        <p className="text-sm text-muted-foreground">Font size: {previewTemplate.fontSize}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Document Body Preview */}
                <div className="p-6">
                  {/* Header */}
                  {previewTemplate.headerText && (
                    <div className="border-b pb-2 mb-4 text-center text-sm text-muted-foreground">
                      {previewTemplate.headerText}
                    </div>
                  )}
                  
                  {/* Table of Contents */}
                  <div className="mb-8">
                    <h2 className="text-lg font-bold mb-4">Table of Contents</h2>
                    <div className="space-y-2">
                      {previewTemplate.sectionOrder && previewTemplate.sectionOrder.length > 0 ? (
                        previewTemplate.sectionOrder.map((section, index) => (
                          <div key={index} className="flex justify-between">
                            <span>{index + 1}. {section}</span>
                            <span className="text-muted-foreground">Page {index + 2}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground italic">No sections defined</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Section Previews */}
                  {previewTemplate.sectionOrder && previewTemplate.sectionOrder.length > 0 && (
                    <div className="space-y-6">
                      {previewTemplate.sectionOrder.map((section, index) => (
                        <div key={index} className="border rounded-md p-4">
                          <h3 className="text-lg font-bold mb-2">{index + 1}. {section}</h3>
                          <div className="h-40 bg-muted/30 flex items-center justify-center rounded-md">
                            <p className="text-muted-foreground">
                              Content for {section} section will appear here
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Footer */}
                  {previewTemplate.hasFooter && (
                    <div className="border-t pt-4 mt-8 text-center text-sm text-muted-foreground">
                      {previewTemplate.footerText || 'Page [Page Number] of [Total Pages]'}
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter>
                <Button onClick={() => setIsPreviewDialogOpen(false)}>
                  Close Preview
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}