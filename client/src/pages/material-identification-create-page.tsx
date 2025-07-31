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
import { materialTypes } from "../../../shared/schema";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { MaterialFileInfoSection } from "@/components/MaterialFileInfoSection";

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
  inspectionOrderNumber: z.string().optional().or(z.literal("")),
  materialType: z.string().min(1, "Material Type is required"),
  materialDescription: z.string().min(1, "Material Description is required"),
  specification: z.string().min(1, "Specification is required"),
  materialGrade: z.string().min(1, "Material Grade is required"),
  heatNumber: z.string().min(1, "Heat Number is required"),
  batchNumber: z.string().optional(),
  millName: z.string().min(1, "Mill Name is required"),
  millTestCertificateNumber: z.string().min(1, "Mill Test Certificate Number is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unit: z.string().min(1, "Unit is required"),
  dimensions: z.string().optional(),
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

// Function to determine unit based on material grade
const getUnitForMaterialGrade = (materialGrade: string): string => {
  // Bolts and Nuts are typically counted as individual pieces
  if (materialGrade.includes('SA-193') || materialGrade.includes('SA-194') || 
      materialGrade.includes('SA-325') || materialGrade.includes('SA-490') || 
      materialGrade.includes('SA-563')) {
    return 'Nos';
  }
  
  // Gaskets are typically counted as individual pieces  
  if (materialGrade.includes('AF 159') || materialGrade.toLowerCase().includes('gasket')) {
    return 'Nos';
  }
  
  // Pipes and tubes are typically measured in meters
  if (materialGrade.includes('SA-106') || materialGrade.includes('SA-312') || 
      materialGrade.includes('SA-213') || materialGrade.includes('SA-335') || 
      materialGrade.includes('API 5L')) {
    return 'Mtr';
  }
  
  // Plates and sheets are typically measured in square meters or pieces
  if (materialGrade.includes('SA-516') || materialGrade.includes('SA-240') || 
      materialGrade.includes('SA-36') || materialGrade.includes('SA-537') || 
      materialGrade.includes('ASTM A36') || materialGrade.includes('SA-387')) {
    return 'Sqm';
  }
  
  // Fittings and flanges are typically counted as pieces
  if (materialGrade.includes('SA-234') || materialGrade.includes('SA-182') || 
      materialGrade.includes('SA-403')) {
    return 'Pcs';
  }
  
  // Default to pieces for all other materials
  return 'Pcs';
};

export default function MaterialIdentificationCreatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Debug component loading
  console.log('🚀 MaterialIdentificationCreatePage loaded');
  
  // Document upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType] = useState('inspection_report'); // Always use inspection_report
  const [documentDescription, setDocumentDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-population state
  const [isAutoPopulated, setIsAutoPopulated] = useState({
    projectId: false,
    projectName: false,
    projectNumber: false,
    unit: false // Track unit field auto-population
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
    unit: string;
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
      materialType: "",
      materialDescription: "",

      specification: "",
      materialGrade: "",
      heatNumber: "",
      batchNumber: "",
      millName: "",
      millTestCertificateNumber: "",
      quantity: "",
      unit: "Pcs", // Default unit that will be auto-populated
      dimensions: "",
      materialStatus: "",
      inspectorName: "",
      inspectionDate: new Date(),
      remarks: "",
    },
  });
  
  // Store navigation parameters for returning to list
  const [keepVisibleState, setKeepVisibleState] = useState<string | null>(null);
  const [projectIdForNavigation, setProjectIdForNavigation] = useState<string | null>(null);
  
  // Helper function to navigate back to list with proper parameters
  const navigateBackToList = () => {
    if (projectIdForNavigation && keepVisibleState === 'true') {
      navigate(`/quality/material-identification?project=${projectIdForNavigation}&keep=true`);
    } else {
      navigate('/quality/material-identification');
    }
  };
  
  // Auto-population from URL parameters (from Material Identification list page)
  useEffect(() => {
    console.log('🔍 Checking URL parameters for project data...');
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    const projectCode = urlParams.get('projectCode');
    const projectName = urlParams.get('projectName');
    const keepParam = urlParams.get('keep');
    
    // Store navigation parameters for returning to list
    setKeepVisibleState(keepParam);
    setProjectIdForNavigation(projectId);
    
    console.log('📦 URL parameters:', { projectId, projectCode, projectName, keep: keepParam });
    
    if (projectId && projectCode && projectName) {
      console.log('📋 Found project data in URL parameters');
      
      // Auto-populate project fields
      form.setValue('projectId', parseInt(projectId));
      form.setValue('projectName', projectName);
      form.setValue('projectNumber', projectCode);
      
      // Trigger form validation and re-render
      form.trigger(['projectId', 'projectName', 'projectNumber']);
      
      // Mark fields as auto-populated for styling
      setIsAutoPopulated({
        projectId: true,
        projectName: true,
        projectNumber: true
      });
      
      console.log('✨ Auto-populated project fields:', {
        projectId: parseInt(projectId),
        projectName: projectName,
        projectNumber: projectCode
      });
      console.log('🎨 Applied auto-population styling state:', {
        projectId: true,
        projectName: true,
        projectNumber: true
      });
      
      // Debug form values after setting
      setTimeout(() => {
        console.log('🔍 Form values after auto-population:', {
          projectId: form.getValues('projectId'),
          projectName: form.getValues('projectName'),
          projectNumber: form.getValues('projectNumber')
        });
        
        // Force a complete form update
        form.setValue('projectId', parseInt(projectId), { shouldValidate: true, shouldDirty: true });
        form.setValue('projectName', projectName, { shouldValidate: true, shouldDirty: true });
        form.setValue('projectNumber', projectCode, { shouldValidate: true, shouldDirty: true });
        
        console.log('🔄 Forced form update with validation flags');
      }, 100);
      
      // Clean up URL parameters after use to avoid confusion
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      console.log('🗑️ Cleaned up URL parameters after auto-population');
      
    } else {
      console.log('❌ No project data found in URL parameters');
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
        materialType: templateData.material_type || "",
        materialDescription: templateData.material_description || "",

        specification: templateData.specification || "",
        materialGrade: templateData.material_grade || "",
        heatNumber: templateData.heat_number || "",
        batchNumber: templateData.batch_number || "",
        millName: templateData.mill_name || "",
        millTestCertificateNumber: templateData.mill_test_certificate_number || "",
        quantity: templateData.quantity || "",
        unit: templateData.unit || "Pcs", // Default to "Pcs" if not provided
        dimensions: templateData.dimensions || "",
        materialStatus: templateData.material_status || "",
        inspectorName: templateData.inspector_name || "",
        inspectionDate: templateData.inspection_date ? new Date(templateData.inspection_date) : new Date(),
        remarks: templateData.remarks || "",
      };
      
      // Reset form with formatted data
      form.reset(formattedData);
      
      // Mark unit field as auto-populated from backend template
      if (templateData.unit) {
        setIsAutoPopulated(prev => ({
          ...prev,
          unit: true
        }));
        console.log('✨ Unit field auto-populated from backend template:', templateData.unit);
      }
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
    // Validate file selection (mandatory)
    if (!selectedFile) {
      toast({
        title: "File Required",
        description: "Please select an Inspection Report file before creating the record.",
        variant: "destructive",
      });
      return;
    }
    
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
        const recordId = responseData.id || formattedData.materialIdentificationId;
        
        // Store the created record's ID
        setCreatedRecordId(recordId);
        
        toast({
          title: "Material Identification Created",
          description: `Material Identification ${formattedData.materialIdentificationId} has been created successfully.`,
        });
        
        // If a file was selected, upload it automatically
        if (selectedFile && documentType) {
          try {
            setIsUploading(true);
            
            const fileFormData = new FormData();
            fileFormData.append('file', selectedFile);
            fileFormData.append('documentType', documentType);
            fileFormData.append('description', documentDescription || 'Document uploaded during record creation');
            
            const uploadResponse = await fetch(`/api/quality/material-identification/${recordId}/documents`, {
              method: 'POST',
              body: fileFormData,
            });
            
            if (uploadResponse.ok) {
              toast({
                title: "File uploaded successfully",
                description: `Document "${selectedFile.name}" has been uploaded.`,
              });
              
              // Clear file selection after successful upload
              setSelectedFile(null);
              setDocumentType('inspection_report');
              setDocumentDescription('');
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            } else {
              throw new Error('Failed to upload document');
            }
          } catch (uploadError) {
            console.error('Error uploading document:', uploadError);
            toast({
              title: "Document upload failed",
              description: "The record was created but the document could not be uploaded. You can upload it later from the list page.",
              variant: "destructive",
            });
          } finally {
            setIsUploading(false);
          }
        }
        
        // Navigate back to list after successful creation (and optional upload)
        setTimeout(() => {
          navigateBackToList();
        }, selectedFile ? 2000 : 1500); // Wait longer if file was uploaded
        
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
                  
                  {/* Material Types */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="materialType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Type</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select material type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {materialTypes.map((materialType) => (
                                <SelectItem key={materialType} value={materialType}>
                                  {materialType}
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
                            onValueChange={(value) => {
                              field.onChange(value);
                              // Auto-populate unit based on selected material grade
                              const autoUnit = getUnitForMaterialGrade(value);
                              form.setValue('unit', autoUnit, { 
                                shouldValidate: true, 
                                shouldDirty: true 
                              });
                              // Mark unit field as auto-populated from material grade selection
                              setIsAutoPopulated(prev => ({
                                ...prev,
                                unit: true
                              }));
                              console.log(`🔧 Material Grade selected: ${value}, Auto-populated Unit: ${autoUnit}`);
                            }}
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
                  
                  {/* Quantity, Unit, and Dimensions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., 10" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Pcs"
                              className={isAutoPopulated.unit ? "bg-blue-50 text-blue-700 border-blue-200" : ""}
                            />
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
                          <FormLabel>Dimensions (Optional)</FormLabel>
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
                  
                  {/* File Upload Section */}
                  <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Inspection Report Upload <span className="text-red-500">*</span>
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Please upload an Inspection Report for this Material Identification record. 
                        Supported formats: PDF, DOC, DOCX (Max size: 10MB)
                      </p>
                    </div>
                    
                    <div className="space-y-4">
                      {/* File Selection */}
                      <div className="space-y-2">
                        <label htmlFor="fileUpload" className="text-sm font-medium text-gray-700">
                          Select Inspection Report
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            id="fileUpload"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                setSelectedFile(e.target.files[0]);
                              }
                            }}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2"
                          >
                            <Upload className="h-4 w-4" />
                            Choose File
                          </Button>
                          {selectedFile && (
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-600" />
                              <span className="text-sm text-gray-700 truncate max-w-[200px]">
                                {selectedFile.name}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedFile(null);
                                  if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Document Description */}
                      {selectedFile && (
                        <div>
                          <label htmlFor="documentDescription" className="text-sm font-medium text-gray-700">
                            Document Description (Optional)
                          </label>
                          <Textarea
                            id="documentDescription"
                            value={documentDescription}
                            onChange={(e) => setDocumentDescription(e.target.value)}
                            placeholder="Brief description of this document..."
                            className="mt-1 min-h-[60px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Form buttons */}
                  <div className="flex justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={navigateBackToList}
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
                      <Button 
                        type="submit" 
                        disabled={form.formState.isSubmitting || isUploading || !selectedFile}
                        className="flex items-center gap-2"
                      >
                        {form.formState.isSubmitting || isUploading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Creating & Uploading...
                          </>
                        ) : (
                          <>
                            {!selectedFile ? 'Select File to Continue' : 'Create & Upload File'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
        
        {/* Uploaded File Information Section */}
        <MaterialFileInfoSection 
          materialId={createdRecordId ? parseInt(createdRecordId) : null}
          className="mt-6"
        />
        

      </div>
    </Layout>
  );
}