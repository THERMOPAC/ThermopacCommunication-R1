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
import { Loader2, PlusCircle, Settings, FileText, Eye, LayoutTemplate, ArrowUpDown, Trash2, GripVertical } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  TemplateSectionType, 
  templateSectionTypes, 
  templateFontSizes,
  TemplateSection,
  TemplateSectionField
} from '@shared/schema';

// Use constants from schema.ts
import { 
  templatePaperSizes, 
  templateOrientations,
  type TemplatePaperSize,
  type TemplateOrientation 
} from '@shared/schema';

// Helper function to generate unique IDs for field items
function generateUniqueId(): string {
  // Use crypto.randomUUID if available, otherwise fallback to timestamp-based ID
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Define relevant database tables for each section type
const sectionDatabaseTables: Record<TemplateSectionType, string[]> = {
  "Material Traceability": [
    "materialIdentification", 
    "materialInspections", 
    "certificates"
  ],
  "Welding & Weld Maps": [
    "weldingProcedures", 
    "weldMaps", 
    "welders", 
    "welds"
  ],
  "NDT": [
    "ndtInspections", 
    "ndtReports", 
    "ndtCalibration"
  ],
  "Visual Inspection": [
    "visualInspections", 
    "dimensionalInspections"
  ],
  "Hydrotest": [
    "hydrotestResults", 
    "pressureTests"
  ],
  "Non-Conformance": [
    "nonConformanceReports", 
    "dispositions", 
    "correctiveActions"
  ]
};

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
  
  // New advanced options
  paperSize?: TemplatePaperSize;
  orientation?: TemplateOrientation;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  sectionConfigurations?: TemplateSection[];
  showCompanyLogo?: boolean;
  logoPosition?: string;
  
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
  
  // New advanced options
  paperSize: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
  orientation: z.enum(['Portrait', 'Landscape']).default('Portrait'),
  marginTop: z.number().min(0).max(100).default(25),
  marginBottom: z.number().min(0).max(100).default(25),
  marginLeft: z.number().min(0).max(100).default(25),
  marginRight: z.number().min(0).max(100).default(25),
  sectionConfigurations: z.array(
    z.object({
      type: z.enum(templateSectionTypes),
      title: z.string(),
      enabled: z.boolean().default(true),
      fields: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(['text', 'checkbox', 'date', 'number', 'select']),
          required: z.boolean().default(false),
          options: z.array(z.string()).optional(),
          defaultValue: z.any().optional(),
          databaseTable: z.string().optional(),
          databaseColumn: z.string().optional()
        })
      )
    })
  ).optional(),
  showCompanyLogo: z.boolean().default(true),
  logoPosition: z.string().default('header'),
  
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
      
      // Add default values for new fields
      paperSize: 'A4',
      orientation: 'Portrait',
      marginTop: 25,
      marginBottom: 25,
      marginLeft: 25,
      marginRight: 25,
      showCompanyLogo: true,
      logoPosition: 'header',
      sectionConfigurations: templateSectionTypes.map(type => ({
        type,
        title: type,
        enabled: true,
        fields: []
      })),
      
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
      
      // Add default values for new fields
      paperSize: 'A4',
      orientation: 'Portrait',
      marginTop: 25,
      marginBottom: 25,
      marginLeft: 25,
      marginRight: 25,
      showCompanyLogo: true,
      logoPosition: 'header',
      sectionConfigurations: templateSectionTypes.map(type => ({
        type,
        title: type,
        enabled: true,
        fields: []
      })),
      
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
      return apiRequest('POST', `/api/templates/${id}/set-default`);
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
      return apiRequest('DELETE', `/api/templates/${id}`);
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
    
    // Create section configurations from section order if not available
    let sectionConfigs = template.sectionConfigurations;
    if (!sectionConfigs && template.sectionOrder) {
      sectionConfigs = template.sectionOrder.map((type) => ({
        type,
        title: type,
        enabled: true,
        fields: []
      }));
    }
    
    editForm.reset({
      name: template.name,
      type: template.type,
      hasCoverPage: template.hasCoverPage,
      hasFooter: template.hasFooter,
      fontSize: template.fontSize as any,
      headerText: template.headerText || '',
      footerText: template.footerText || '',
      sectionOrder: template.sectionOrder || [],
      
      // New advanced fields
      paperSize: (template.paperSize || 'A4') as TemplatePaperSize,
      orientation: (template.orientation || 'Portrait') as TemplateOrientation,
      marginTop: template.marginTop || 25,
      marginBottom: template.marginBottom || 25,
      marginLeft: template.marginLeft || 25,
      marginRight: template.marginRight || 25,
      sectionConfigurations: sectionConfigs || templateSectionTypes.map(type => ({
        type,
        title: type,
        enabled: true,
        fields: []
      })),
      showCompanyLogo: template.showCompanyLogo !== undefined ? template.showCompanyLogo : true,
      logoPosition: template.logoPosition || 'header',
      
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
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Template Management</h1>
        <p className="text-muted-foreground">Create and manage document templates for QMS Final Dossier</p>
      </div>
      <div className="container mx-auto py-6">
        <div className="flex justify-end mb-6">
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" style={{ maxHeight: "90vh", overflowY: "auto" }}>
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
                  <Tabs defaultValue="general">
                    <TabsList className="w-full">
                      <TabsTrigger value="general">General</TabsTrigger>
                      <TabsTrigger value="layout">Page Layout</TabsTrigger>
                      <TabsTrigger value="branding">Branding</TabsTrigger>
                    </TabsList>
                    
                    {/* General Styling */}
                    <TabsContent value="general" className="space-y-6 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="fontSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Font Size</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
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
                                Choose the font size for the document.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
                    
                    {/* Page Layout */}
                    <TabsContent value="layout" className="space-y-6 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="paperSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Paper Size</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select paper size" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {templatePaperSizes.map((size) => (
                                    <SelectItem key={size} value={size}>
                                      {size}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Standard paper sizes for documents
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="orientation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Orientation</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select orientation" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {templateOrientations.map((orientation) => (
                                    <SelectItem key={orientation} value={orientation}>
                                      {orientation}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Page orientation for documents
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="space-y-4">
                        <FormLabel>Margins (mm)</FormLabel>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="marginTop"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Top</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="marginBottom"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bottom</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="marginLeft"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Left</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="marginRight"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Right</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </TabsContent>
                    
                    {/* Branding */}
                    <TabsContent value="branding" className="space-y-6 pt-4">
                      <FormField
                        control={form.control}
                        name="showCompanyLogo"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Show Company Logo</FormLabel>
                              <FormDescription>
                                Include the company logo in the document.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      
                      {form.watch('showCompanyLogo') && (
                        <FormField
                          control={form.control}
                          name="logoPosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Logo Position</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select logo position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="header">Header</SelectItem>
                                  <SelectItem value="cover_page">Cover Page Only</SelectItem>
                                  <SelectItem value="footer">Footer</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Choose where to display the company logo.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                
                {/* Section Order Tab */}
                <TabsContent value="sections" className="space-y-6 pt-4">
                  {/* Section Order panel */}
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
                  
                  <Separator className="my-6" />
                  
                  {/* Section Configuration panel */}
                  <FormField
                    control={form.control}
                    name="sectionConfigurations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Configuration</FormLabel>
                        <FormDescription className="mb-4">
                          Customize which fields appear in each section and how they are presented.
                        </FormDescription>
                        
                        <Accordion type="multiple" className="w-full">
                          {field.value?.map((sectionConfig, sectionIndex) => (
                            <AccordionItem key={sectionIndex} value={sectionConfig.type}>
                              <AccordionTrigger className="hover:bg-muted px-3 rounded-md">
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={sectionConfig.enabled}
                                    onCheckedChange={(checked) => {
                                      const newConfigs = [...form.getValues().sectionConfigurations || []];
                                      newConfigs[sectionIndex].enabled = checked;
                                      form.setValue('sectionConfigurations', newConfigs);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span>{sectionConfig.title}</span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-2">
                                <div className="space-y-4 pt-2">
                                  {/* Section Title */}
                                  <div className="flex items-center gap-2">
                                    <Label htmlFor={`section-title-${sectionIndex}`}>Section Title</Label>
                                    <Input 
                                      id={`section-title-${sectionIndex}`}
                                      value={sectionConfig.title}
                                      onChange={(e) => {
                                        const newConfigs = [...form.getValues().sectionConfigurations || []];
                                        newConfigs[sectionIndex].title = e.target.value;
                                        form.setValue('sectionConfigurations', newConfigs);
                                      }}
                                      placeholder="Section title"
                                      className="max-w-xs"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newConfigs = [...form.getValues().sectionConfigurations || []];
                                        newConfigs[sectionIndex].fields = [
                                          ...newConfigs[sectionIndex].fields,
                                          {
                                            id: generateUniqueId(),
                                            name: 'New Field',
                                            type: 'text',
                                            required: false,
                                            databaseTable: undefined,
                                            databaseColumn: undefined,
                                          }
                                        ];
                                        form.setValue('sectionConfigurations', newConfigs);
                                      }}
                                    >
                                      <PlusCircle className="h-4 w-4 mr-1" /> Add Field
                                    </Button>
                                  </div>
                                  
                                  {/* Custom Fields */}
                                  {sectionConfig.fields.length > 0 ? (
                                    <div className="space-y-2">
                                      {sectionConfig.fields.map((field, fieldIndex) => (
                                        <div key={field.id} className="flex items-start gap-2 border rounded-md p-2">
                                          <div className="grid grid-cols-2 gap-2 flex-1">
                                            <div>
                                              <Label htmlFor={`field-name-${field.id}`}>Field Name</Label>
                                              <Input
                                                id={`field-name-${field.id}`}
                                                value={field.name}
                                                onChange={(e) => {
                                                  const newConfigs = [...form.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].name = e.target.value;
                                                  form.setValue('sectionConfigurations', newConfigs);
                                                }}
                                                className="mt-1"
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor={`field-type-${field.id}`}>Field Type</Label>
                                              <Select
                                                value={field.type}
                                                onValueChange={(value: 'text' | 'checkbox' | 'date' | 'number' | 'select') => {
                                                  const newConfigs = [...form.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].type = value;
                                                  form.setValue('sectionConfigurations', newConfigs);
                                                }}
                                              >
                                                <SelectTrigger id={`field-type-${field.id}`} className="mt-1">
                                                  <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="text">Text</SelectItem>
                                                  <SelectItem value="checkbox">Checkbox</SelectItem>
                                                  <SelectItem value="date">Date</SelectItem>
                                                  <SelectItem value="number">Number</SelectItem>
                                                  <SelectItem value="select">Select</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            
                                            <div className="flex items-center mt-2">
                                              <Checkbox
                                                id={`field-required-${field.id}`}
                                                checked={field.required}
                                                onCheckedChange={(checked) => {
                                                  const newConfigs = [...form.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].required = !!checked;
                                                  form.setValue('sectionConfigurations', newConfigs);
                                                }}
                                              />
                                              <Label htmlFor={`field-required-${field.id}`} className="ml-2">Required</Label>
                                            </div>
                                            
                                            {/* Database table selection */}
                                            <div className="col-span-2 mt-3 border-t pt-3">
                                              <Label htmlFor={`field-database-table-${field.id}`}>Database Mapping</Label>
                                              <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div>
                                                  <Label htmlFor={`field-database-table-${field.id}`} className="text-xs text-muted-foreground">Table</Label>
                                                  <Select
                                                    value={field.databaseTable || ''}
                                                    onValueChange={(value) => {
                                                      const newConfigs = [...form.getValues().sectionConfigurations || []];
                                                      newConfigs[sectionIndex].fields[fieldIndex].databaseTable = value === 'none' ? undefined : value;
                                                      form.setValue('sectionConfigurations', newConfigs);
                                                    }}
                                                  >
                                                    <SelectTrigger id={`field-database-table-${field.id}`} className="mt-1">
                                                      <SelectValue placeholder="Select table" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="none">None</SelectItem>
                                                      {sectionDatabaseTables[sectionConfig.type]?.map((table) => (
                                                        <SelectItem key={table} value={table}>{table}</SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div>
                                                  <Label htmlFor={`field-database-column-${field.id}`} className="text-xs text-muted-foreground">Column</Label>
                                                  <Input
                                                    id={`field-database-column-${field.id}`}
                                                    value={field.databaseColumn || ''}
                                                    onChange={(e) => {
                                                      const newConfigs = [...form.getValues().sectionConfigurations || []];
                                                      newConfigs[sectionIndex].fields[fieldIndex].databaseColumn = e.target.value || undefined;
                                                      form.setValue('sectionConfigurations', newConfigs);
                                                    }}
                                                    placeholder="Column name"
                                                    disabled={!field.databaseTable}
                                                    className="mt-1"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => {
                                              const newConfigs = [...form.getValues().sectionConfigurations || []];
                                              newConfigs[sectionIndex].fields.splice(fieldIndex, 1);
                                              form.setValue('sectionConfigurations', newConfigs);
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center p-4 text-muted-foreground text-sm italic">
                                      No custom fields defined. Click "Add Field" to add a new field.
                                    </div>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                        
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" style={{ maxHeight: "90vh", overflowY: "auto" }}>
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
                  
                  <Separator className="my-6" />
                  
                  {/* Section Configuration panel */}
                  <FormField
                    control={editForm.control}
                    name="sectionConfigurations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Section Configuration</FormLabel>
                        <FormDescription className="mb-4">
                          Customize which fields appear in each section and how they are presented.
                        </FormDescription>
                        
                        <Accordion type="multiple" className="w-full">
                          {field.value?.map((sectionConfig, sectionIndex) => (
                            <AccordionItem key={sectionIndex} value={sectionConfig.type}>
                              <AccordionTrigger className="hover:bg-muted px-3 rounded-md">
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={sectionConfig.enabled}
                                    onCheckedChange={(checked) => {
                                      const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                      newConfigs[sectionIndex].enabled = checked;
                                      editForm.setValue('sectionConfigurations', newConfigs);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span>{sectionConfig.title}</span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-2">
                                <div className="space-y-4 pt-2">
                                  {/* Section Title */}
                                  <div className="flex items-center gap-2">
                                    <Label htmlFor={`edit-section-title-${sectionIndex}`}>Section Title</Label>
                                    <Input 
                                      id={`edit-section-title-${sectionIndex}`}
                                      value={sectionConfig.title}
                                      onChange={(e) => {
                                        const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                        newConfigs[sectionIndex].title = e.target.value;
                                        editForm.setValue('sectionConfigurations', newConfigs);
                                      }}
                                      placeholder="Section title"
                                      className="max-w-xs"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                        newConfigs[sectionIndex].fields = [
                                          ...newConfigs[sectionIndex].fields,
                                          {
                                            id: generateUniqueId(),
                                            name: 'New Field',
                                            type: 'text',
                                            required: false,
                                            databaseTable: undefined,
                                            databaseColumn: undefined,
                                          }
                                        ];
                                        editForm.setValue('sectionConfigurations', newConfigs);
                                      }}
                                    >
                                      <PlusCircle className="h-4 w-4 mr-1" /> Add Field
                                    </Button>
                                  </div>
                                  
                                  {/* Custom Fields */}
                                  {sectionConfig.fields.length > 0 ? (
                                    <div className="space-y-2">
                                      {sectionConfig.fields.map((field, fieldIndex) => (
                                        <div key={field.id} className="flex items-start gap-2 border rounded-md p-2">
                                          <div className="grid grid-cols-2 gap-2 flex-1">
                                            <div>
                                              <Label htmlFor={`edit-field-name-${field.id}`}>Field Name</Label>
                                              <Input
                                                id={`edit-field-name-${field.id}`}
                                                value={field.name}
                                                onChange={(e) => {
                                                  const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].name = e.target.value;
                                                  editForm.setValue('sectionConfigurations', newConfigs);
                                                }}
                                                className="mt-1"
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor={`edit-field-type-${field.id}`}>Field Type</Label>
                                              <Select
                                                value={field.type}
                                                onValueChange={(value: 'text' | 'checkbox' | 'date' | 'number' | 'select') => {
                                                  const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].type = value;
                                                  editForm.setValue('sectionConfigurations', newConfigs);
                                                }}
                                              >
                                                <SelectTrigger id={`edit-field-type-${field.id}`} className="mt-1">
                                                  <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="text">Text</SelectItem>
                                                  <SelectItem value="checkbox">Checkbox</SelectItem>
                                                  <SelectItem value="date">Date</SelectItem>
                                                  <SelectItem value="number">Number</SelectItem>
                                                  <SelectItem value="select">Select</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            
                                            <div className="flex items-center mt-2">
                                              <Checkbox
                                                id={`edit-field-required-${field.id}`}
                                                checked={field.required}
                                                onCheckedChange={(checked) => {
                                                  const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                                  newConfigs[sectionIndex].fields[fieldIndex].required = !!checked;
                                                  editForm.setValue('sectionConfigurations', newConfigs);
                                                }}
                                              />
                                              <Label htmlFor={`edit-field-required-${field.id}`} className="ml-2">Required</Label>
                                            </div>
                                            
                                            {/* Database table selection */}
                                            <div className="col-span-2 mt-3 border-t pt-3">
                                              <Label htmlFor={`edit-field-database-table-${field.id}`}>Database Mapping</Label>
                                              <div className="grid grid-cols-2 gap-2 mt-2">
                                                <div>
                                                  <Label htmlFor={`edit-field-database-table-${field.id}`} className="text-xs text-muted-foreground">Table</Label>
                                                  <Select
                                                    value={field.databaseTable || ''}
                                                    onValueChange={(value) => {
                                                      const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                                      newConfigs[sectionIndex].fields[fieldIndex].databaseTable = value === 'none' ? undefined : value;
                                                      editForm.setValue('sectionConfigurations', newConfigs);
                                                    }}
                                                  >
                                                    <SelectTrigger id={`edit-field-database-table-${field.id}`} className="mt-1">
                                                      <SelectValue placeholder="Select table" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="none">None</SelectItem>
                                                      {sectionDatabaseTables[sectionConfig.type]?.map((table) => (
                                                        <SelectItem key={table} value={table}>{table}</SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div>
                                                  <Label htmlFor={`edit-field-database-column-${field.id}`} className="text-xs text-muted-foreground">Column</Label>
                                                  <Input
                                                    id={`edit-field-database-column-${field.id}`}
                                                    value={field.databaseColumn || ''}
                                                    onChange={(e) => {
                                                      const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                                      newConfigs[sectionIndex].fields[fieldIndex].databaseColumn = e.target.value || undefined;
                                                      editForm.setValue('sectionConfigurations', newConfigs);
                                                    }}
                                                    placeholder="Column name"
                                                    disabled={!field.databaseTable}
                                                    className="mt-1"
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => {
                                              const newConfigs = [...editForm.getValues().sectionConfigurations || []];
                                              newConfigs[sectionIndex].fields.splice(fieldIndex, 1);
                                              editForm.setValue('sectionConfigurations', newConfigs);
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center p-4 text-muted-foreground text-sm italic">
                                      No custom fields defined. Click "Add Field" to add a new field.
                                    </div>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                        
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
                        <div className="text-sm text-muted-foreground mt-2 space-y-1">
                          <p>Font size: {previewTemplate.fontSize}</p>
                          <p>Paper: {previewTemplate.paperSize || 'A4'} ({previewTemplate.orientation || 'Portrait'})</p>
                          <p>Margins: {previewTemplate.marginTop || 25}mm (top), {previewTemplate.marginBottom || 25}mm (bottom), {previewTemplate.marginLeft || 25}mm (left), {previewTemplate.marginRight || 25}mm (right)</p>
                        </div>
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