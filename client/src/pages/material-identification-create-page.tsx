import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Upload, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

// Define interfaces for the data types
interface Project {
  id: number;
  name: string;
  code: string;
  description?: string;
  status: string;
  projectCode?: string;
  projectNumber?: string;
}

// Define interface for document
interface Document {
  id: number;
  material_identification_id: number;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  file_size: number;
  document_type: string;
  description: string;
  uploaded_by: number;
  created_at: string;
}

// Define schema for Material Identification form
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string().min(1, "MI ID is required"),
  projectId: z.number().nullable().or(z.string().transform(id => parseInt(id, 10))).optional(),
  projectName: z.string().min(1, "Project Name is required"),
  projectNumber: z.string().min(1, "Project Number is required"),
  inspectionOrderNumber: z.string().optional(),
  materialDescription: z.string().min(1, "Material Description is required"),
  materialCode: z.string().min(1, "Material Code is required"),
  specification: z.string().min(1, "Specification is required"),
  materialGrade: z.string().min(1, "Material Grade is required"),
  heatNumber: z.string().min(1, "Heat Number is required"),
  batchNumber: z.string().optional(),
  millName: z.string().min(1, "Mill Name is required"),
  millTestCertificateNumber: z.string().min(1, "Mill Test Certificate Number is required"),
  quantity: z.string().min(1, "Quantity is required"),
  dimensions: z.string().min(1, "Dimensions are required"),
  materialStatus: z.string().min(1, "Material Status is required"),
  inspectorName: z.string().min(1, "Inspector's Name is required"),
  inspectionDate: z.date({
    required_error: "Inspection Date is required",
  }),
  remarks: z.string().optional()
});

// Define type for form values
type MaterialIdentificationFormValues = z.infer<typeof materialIdentificationSchema>;

// Material Grade options matching PMA page exactly
const materialGradeOptions = [
  // Carbon Steel
  {
    group: 'Carbon Steel',
    options: [
      'SA-516 Gr 60', 'SA-516 Gr 70', 'SA-106 Gr B', 'SA-106 Gr C', 
      'SA-36', 'SA-537 Cl 1', 'SA-537 Cl 2', 'SA-53 Gr B',
      'SA-105', 'SA-234 WPB', 'ASTM A36', 'ASTM A106 Gr B',
      'ASTM A333 Gr 6', 'ASTM A515 Gr 70', 'Gr.B'
    ]
  },
  // Stainless Steel
  {
    group: 'Stainless Steel',
    options: [
      'SA-240 Type 304', 'SA-240 Type 304L', 'SA-240 Type 316', 'SA-240 Type 316L',
      'SA-240 Type 321', 'SA-312 TP304', 'SA-312 TP304L', 'SA-312 TP316',
      'SA-312 TP316L', 'SA-213 TP304', 'SA-213 TP304L', 'SA-213 TP316',
      'SA-213 TP316L', 'SA-182 F304', 'SA-182 F316', 'SA-403 Gr. WP 316L'
    ]
  },
  // Alloy Steel
  {
    group: 'Alloy Steel',
    options: [
      'SA-387 Gr 11 Cl 2', 'SA-387 Gr 22 Cl 2', 'SA-335 P11', 'SA-335 P22',
      'SA-182 F11', 'SA-182 F22', 'SA-234 WP11', 'SA-234 WP22'
    ]
  },
  // API Grades
  {
    group: 'API Grades',
    options: [
      'API 5L Gr B', 'API 5L X42', 'API 5L X52', 'API 5L X60',
      'API 5L X65', 'API 5L X70'
    ]
  },
  // Duplex Steel
  {
    group: 'Duplex Steel',
    options: [
      'ASTM A240 UNS S31803 (2205)', 'ASTM A240 UNS S32750 (2507)',
      'ASTM A790 UNS S31803', 'ASTM A790 UNS S32750'
    ]
  },
  // Bolts
  {
    group: 'Bolts',
    options: ['SA-193 B7', 'SA-193 Gr. B8', 'SA-325 Type 1', 'SA-490 Type 1']
  },
  // Nuts
  {
    group: 'Nuts',
    options: ['SA-194 Gr. 8', 'SA-194 Gr. 2H', 'SA-194 2H', 'SA-194 7', 'SA-563 Grade A']
  },
  // Gaskets
  {
    group: 'Gaskets',
    options: ['AF 159']
  }
];

export default function MaterialIdentificationCreatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Debug component loading
  console.log('🚀 MaterialIdentificationCreatePage loaded');
  
  // Document upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('general');
  const [documentDescription, setDocumentDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-population state
  const [isAutoPopulated, setIsAutoPopulated] = useState({
    projectId: false,
    projectName: false,
    projectNumber: false
  });
  
  interface NextIdResponse {
    nextId: string;
  }
  
  interface TemplateResponse {
    material_identification_id: string;
    project_id: number | null;
    project_name: string;
    project_number: string;
    inspection_order_number: string;
    material_description: string;
    material_code: string;
    specification: string;
    material_grade: string;
    heat_number: string;
    batch_number: string | null;
    mill_name: string;
    mill_test_certificate_number: string;
    quantity: string;
    dimensions: string;
    material_status: string;
    inspector_name: string;
    inspection_date: string;
    remarks: string | null;
  }
  
  // Get next ID for new Material Identification record
  const { data: nextIdData, isLoading: isLoadingNextId } = useQuery<NextIdResponse>({
    queryKey: ['/api/quality/material-identification/next-id'],
    staleTime: 0 // Always get fresh ID
  });
  
  // Get template for new material identification record
  const { data: templateData, isLoading: isLoadingTemplate } = useQuery<TemplateResponse>({
    queryKey: ['/api/quality/material-identification/new'],
    staleTime: 0 // Always get fresh template
  });
  
  // Get all projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
  
  // Create form with default values
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues: {
      materialIdentificationId: "",
      projectId: undefined,
      projectName: "",
      projectNumber: "",
      inspectionOrderNumber: "",
      materialDescription: "",
      materialCode: "",
      specification: "",
      materialGrade: "",
      heatNumber: "",
      batchNumber: "",
      millName: "",
      millTestCertificateNumber: "",
      quantity: "",
      dimensions: "",
      materialStatus: "",
      inspectorName: "",
      inspectionDate: new Date(),
      remarks: "",
    },
  });
  
  // Auto-population from sessionStorage (from Material Identification list page)
  useEffect(() => {
    console.log('🔍 Checking sessionStorage for materialIdentificationProject...');
    const storedProjectData = sessionStorage.getItem('materialIdentificationProject');
    console.log('📦 Raw sessionStorage data:', storedProjectData);
    
    if (storedProjectData) {
      try {
        const projectData = JSON.parse(storedProjectData);
        console.log('📋 Found stored project data:', projectData);
        
        // Auto-populate project fields
        form.setValue('projectId', projectData.id);
        form.setValue('projectName', projectData.name);
        form.setValue('projectNumber', projectData.code);
        
        // Mark fields as auto-populated for styling
        setIsAutoPopulated({
          projectId: true,
          projectName: true,
          projectNumber: true
        });
        
        console.log('✨ Auto-populated project fields:', {
          projectId: projectData.id,
          projectName: projectData.name,
          projectNumber: projectData.code
        });
        console.log('🎨 Applied auto-population styling state:', {
          projectId: true,
          projectName: true,
          projectNumber: true
        });
        
        // Clear sessionStorage after use
        sessionStorage.removeItem('materialIdentificationProject');
        console.log('🗑️ Cleared sessionStorage after auto-population');
        
      } catch (error) {
        console.error('❌ Error parsing stored project data:', error);
      }
    } else {
      console.log('❌ No stored project data found in sessionStorage');
    }
  }, [form]);

  // Update form with template data and next ID when loaded
  useEffect(() => {
    if (templateData && nextIdData) {
      // Transform API response to match form field names
      const formattedData = {
        materialIdentificationId: nextIdData.nextId || "",
        projectId: templateData.project_id || undefined,
        projectName: templateData.project_name || "",
        projectNumber: templateData.project_number || "",
        inspectionOrderNumber: templateData.inspection_order_number || "",
        materialDescription: templateData.material_description || "",
        materialCode: templateData.material_code || "",
        specification: templateData.specification || "",
        materialGrade: templateData.material_grade || "",
        heatNumber: templateData.heat_number || "",
        batchNumber: templateData.batch_number || "",
        millName: templateData.mill_name || "",
        millTestCertificateNumber: templateData.mill_test_certificate_number || "",
        quantity: templateData.quantity || "",
        dimensions: templateData.dimensions || "",
        materialStatus: templateData.material_status || "",
        inspectorName: templateData.inspector_name || "",
        inspectionDate: templateData.inspection_date ? new Date(templateData.inspection_date) : new Date(),
        remarks: templateData.remarks || "",
      };
      
      // Reset form with formatted data
      form.reset(formattedData);
    }
  }, [templateData, nextIdData, form]);
  
  // Handle project selection
  const handleProjectSelect = (projectId: string) => {
    const selectedProject = projects.find(project => project.id.toString() === projectId);
    
    if (selectedProject) {
      // Update project-related fields
      form.setValue('projectId', selectedProject.id);
      form.setValue('projectName', selectedProject.name);
      form.setValue('projectNumber', selectedProject.code || selectedProject.projectCode || selectedProject.projectNumber || "");
      
      // Trigger validation
      form.trigger('projectId');
      form.trigger('projectName');
      form.trigger('projectNumber');
    }
  };
  
  // Handle form submission
  const onSubmit = async (data: MaterialIdentificationFormValues) => {
    try {
      // Format date for API
      const formattedData = {
        ...data,
        inspectionDate: format(data.inspectionDate, 'yyyy-MM-dd'),
      };
      
      // Submit to API
      const response = await fetch('/api/quality/material-identification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formattedData),
      });
      
      if (response.ok) {
        const responseData = await response.json();
        
        // Store the created record's ID for document uploads
        setCreatedRecordId(responseData.id || formattedData.materialIdentificationId);
        
        toast({
          title: "Material Identification Created",
          description: `Material Identification ${formattedData.materialIdentificationId} has been created successfully.`,
        });
        
        // Show document upload dialog
        setUploadDialogOpen(true);
      } else {
        throw new Error('Failed to create record');
      }
    } catch (error) {
      console.error("Error creating material identification:", error);
      toast({
        title: "Error",
        description: "Failed to create Material Identification record. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };
  
  // Reset upload form
  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocumentType('general');
    setDocumentDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Close upload dialog and navigate
  const handleFinishUploads = () => {
    setUploadDialogOpen(false);
    navigate('/quality/material-identification');
  };
  
  // Upload document
  const handleUpload = async () => {
    if (!createdRecordId) {
      toast({
        title: "Error",
        description: "Cannot upload document - record ID not found",
        variant: "destructive"
      });
      return;
    }
    
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', documentType);
      formData.append('description', documentDescription);
      
      const response = await fetch(`/api/quality/material-identification/${createdRecordId}/documents`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload document');
      }
      
      toast({
        title: "Document uploaded",
        description: "Document has been successfully uploaded",
      });
      
      resetUploadForm();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const isLoading = isLoadingNextId || isLoadingTemplate || isLoadingProjects;
  
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Material Identification Record</CardTitle>
            <CardDescription>
              Fill in all the required details for this Material Identification record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* First row: Project and MI ID */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="projectNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project No.</FormLabel>
                          <FormControl>
                            {isAutoPopulated.projectNumber ? (
                              <Input 
                                {...field} 
                                readOnly 
                                className="bg-gray-50 text-gray-700"
                              />
                            ) : (
                              <Select
                                value={form.watch('projectId')?.toString()}
                                onValueChange={handleProjectSelect}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select project number" />
                                </SelectTrigger>
                                <SelectContent>
                                  {projects
                                    .filter(project => project.status === 'active')
                                    .map((project) => (
                                      <SelectItem key={project.id} value={project.id.toString()}>
                                        {project.code || project.projectCode || project.projectNumber || `Project ${project.id}`}
                                      </SelectItem>
                                    ))
                                  }
                                </SelectContent>
                              </Select>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="projectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              readOnly 
                              className={isAutoPopulated.projectName ? "bg-gray-50 text-gray-700" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="materialIdentificationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>MI ID</FormLabel>
                          <FormControl>
                            <Input {...field} readOnly />
                          </FormControl>
                          <FormDescription>
                            Format: MI-YYYY-N (Year-Sequence)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Material details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="materialDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Description</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="materialCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Specification and Material Grade */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="specification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specification</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select specification standard" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="API">API</SelectItem>
                              <SelectItem value="ASME">ASME</SelectItem>
                              <SelectItem value="ASTM">ASTM</SelectItem>
                              <SelectItem value="ATEX">ATEX</SelectItem>
                              <SelectItem value="BS">BS</SelectItem>
                              <SelectItem value="DIN">DIN</SelectItem>
                              <SelectItem value="EN">EN</SelectItem>
                              <SelectItem value="IECEx">IECEx</SelectItem>
                              <SelectItem value="ISO">ISO</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="materialGrade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Grade</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select material grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px] overflow-y-auto">
                              {materialGradeOptions.map((gradeGroup, groupIndex) => (
                                <SelectGroup key={`group-${groupIndex}`}>
                                  <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                    {gradeGroup.group}
                                  </SelectLabel>
                                  {gradeGroup.options.map((grade, optionIndex) => (
                                    <SelectItem key={`${groupIndex}-${optionIndex}-${grade}`} value={grade}>
                                      {grade}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Heat Number and Batch Number */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="heatNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Heat Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="batchNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Batch Number (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Mill Name and MTC Number */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="millName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mill Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Manufacturer/Mill Name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="millTestCertificateNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mill Test Certificate No.</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Quantity and Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., 10 Pcs" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="dimensions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dimensions</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Size, Dimensions, or Thickness" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Material Status */}
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="materialStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Status</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select material status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Accepted">Accepted</SelectItem>
                              <SelectItem value="Rejected">Rejected</SelectItem>
                              <SelectItem value="Hold">Hold</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Inspector's Name and Inspection Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="inspectorName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspector's Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="inspectionDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Inspection Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Select date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date > new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Remarks */}
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Enter any additional comments or observations here"
                              className="min-h-[100px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Form buttons */}
                  <div className="flex justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/quality/material-identification')}
                    >
                      Back to List
                    </Button>
                    
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => form.reset()}
                      >
                        Clear Form
                      </Button>
                      <Button type="submit">
                        Create Material Identification
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
        
        {/* Document Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
          if (!open) {
            // If dialog is being closed, navigate to list
            navigate('/quality/material-identification');
          }
          setUploadDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload relevant documents for this Material Identification record.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="documentType" className="text-sm font-medium">Document Type</label>
                <Select
                  value={documentType}
                  onValueChange={setDocumentType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Document</SelectItem>
                    <SelectItem value="mill_test_certificate">Mill Test Certificate</SelectItem>
                    <SelectItem value="inspection_report">Inspection Report</SelectItem>
                    <SelectItem value="material_certificate">Material Certificate</SelectItem>
                    <SelectItem value="test_report">Test Report</SelectItem>
                    <SelectItem value="technical_datasheet">Technical Datasheet</SelectItem>
                    <SelectItem value="other">Other Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="documentDescription" className="text-sm font-medium">Description</label>
                <Input 
                  id="documentDescription"
                  value={documentDescription}
                  onChange={(e) => setDocumentDescription(e.target.value)}
                  placeholder="Enter document description"
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="file" className="text-sm font-medium">File</label>
                <div className="border rounded-md p-2">
                  <Input 
                    id="file" 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="w-full"
                  />
                </div>
                {selectedFile && (
                  <div className="flex items-center mt-2 text-sm">
                    <FileText className="h-4 w-4 mr-1" />
                    <span className="truncate">{selectedFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 w-6 p-0"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleFinishUploads}
              >
                Skip & Finish
              </Button>
              <Button 
                type="button" 
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? (
                  <>
                    <span className="loading loading-spinner loading-xs mr-2"></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}