import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Info, ArrowLeft } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

// Define the form schema
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string().min(1, "MI ID is required"),
  // IMPORTANT: We need projectId for server-side validation (it's required by the API)
  projectId: z.number().or(z.string().transform(id => parseInt(id, 10))).optional(),
  projectName: z.string().min(1, "Project Name is required"),
  projectNumber: z.string().min(1, "Project Number is required"),
  inspectionOrderNumber: z.string().optional(), // Made optional
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

type MaterialIdentificationFormValues = z.infer<typeof materialIdentificationSchema>;

export default function MaterialIdentificationPage({ params }: { params?: { id?: string } }) {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [location, navigate] = useLocation();
  const [routeMatch, routeParams] = useRoute('/quality/material-identification/:id');
  
  // Extract ID from route params and ensure it's the actual database ID (not material_identification_id)
  const recordId = params?.id || (routeParams as any)?.id;
  const isNewRecord = recordId === 'new';
  
  // Use a React state for edit mode instead of URL parameters
  const [isEditModeState, setIsEditModeState] = useState(false);
  
  // Handle query params for edit mode as a fallback - more robust implementation
  useEffect(() => {
    console.log('Checking for edit mode in URL...');
    
    // Check if URL contains edit=true parameter in the search part
    const urlParams = new URLSearchParams(window.location.search);
    const editParam = urlParams.get('edit');
    
    console.log('Edit parameter from URLSearchParams:', editParam);
    console.log('Full window location:', window.location.href);
    
    // Update edit mode state if the parameter exists
    if (editParam === 'true' && !isEditModeState) {
      console.log('Setting edit mode to true based on URL parameter');
      setIsEditModeState(true);
      setFormDisabled(false);
      
      // Force-enable fields after a short delay
      setTimeout(() => {
        console.log('Force enabling all form fields');
        const formInputs = document.querySelectorAll('input, select, textarea');
        formInputs.forEach((input: Element) => {
          const htmlInput = input as HTMLElement;
          if (htmlInput.hasAttribute('disabled')) {
            htmlInput.removeAttribute('disabled');
          }
        });
      }, 300);
    }
  }, [window.location.search, isEditModeState]);
  
  // Either URL parameter or state can trigger edit mode
  const isEditMode = isEditModeState;
  
  // Extra check to see if URL has edit=true
  const checkEditParam = () => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('Current URL search params:', window.location.search);
    return urlParams.get('edit') === 'true';
  };
  
  console.log('Direct edit param check:', checkEditParam());
  console.log('isEditMode:', isEditMode);
  const isViewMode = recordId && !isNewRecord && !isEditMode;
  console.log('isViewMode:', isViewMode);
  
  // Use state to control form disabled status - explicitly set to false for new records
  const [formDisabled, setFormDisabled] = useState(isViewMode && !isNewRecord);
  
  // Update form disabled state whenever edit mode or view mode changes
  useEffect(() => {
    console.log('Updating formDisabled state - isViewMode:', isViewMode, 'isEditMode:', isEditMode, 'isNewRecord:', isNewRecord);
    
    // Set disabled state based on the current mode:
    // - New record: never disabled
    // - Edit mode: never disabled
    // - View mode (existing record): disabled
    const newDisabledState = !isEditMode && isViewMode && !isNewRecord;
    
    console.log(`Should the form be disabled? ${newDisabledState}`);
    
    if (newDisabledState !== formDisabled) {
      console.log(`Setting form disabled state from ${formDisabled} to ${newDisabledState}`);
      setFormDisabled(newDisabledState);
      
      // Force enable all fields for new records
      if (isNewRecord) {
        setTimeout(() => {
          console.log("Force enabling all form fields for new record");
          const formInputs = document.querySelectorAll('input, select, textarea');
          formInputs.forEach((input: Element) => {
            const htmlInput = input as HTMLElement;
            if (htmlInput.hasAttribute('disabled')) {
              htmlInput.removeAttribute('disabled');
            }
          });
        }, 100);
      }
    }
  }, [isViewMode, isEditMode, isNewRecord, formDisabled]);
  
  console.log('Current formDisabled state:', formDisabled);
  
  // Debug logs
  console.log('Route params:', routeParams);
  console.log('Record ID:', recordId);
  console.log('Location:', location);
  console.log('Is Edit Mode:', isEditMode);
  console.log('Is View Mode:', isViewMode);
  
  // Define types for the API responses
  interface Project {
    id: number;
    projectNumber?: string; // Legacy field
    projectCode?: string;   // Might be used in some cases
    code: string;          // The actual field from the projects table
    name: string;
    status: string;        // Project status (active, completed, etc.)
  }
  
  interface InspectionOrder {
    id: number;
    inspectionOrderNumber: string;
    title: string;
  }
  
  interface NextIdResponse {
    nextId: string;
  }
  
  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    select: (data) => {
      // Log projects status for debugging
      console.log('All projects:', data.map(p => ({ id: p.id, code: p.code, status: p.status })));
      console.log('Active projects:', data.filter(p => p.status === 'active').map(p => ({ id: p.id, code: p.code })));
      return data;
    }
  });
  
  // Fetch inspection orders for the selected project
  const { data: inspectionOrders = [] } = useQuery<InspectionOrder[]>({
    queryKey: ['/api/quality/inspection-orders/project', selectedProject],
    enabled: !!selectedProject,
  });
  
  // Fetch the next auto-generated MI ID (needed for new records)
  const { data: nextIdData, refetch: refetchNextId, isLoading: isLoadingMiId } = useQuery<NextIdResponse>({
    queryKey: ['/api/quality/material-identification/next-id'],
    enabled: true, // Always enable this query as we need it for all new records
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0 // Consider the data immediately stale to force a refetch
  });
  
  // Fetch existing record for edit or view mode
  const { data: existingRecord, isLoading: isLoadingRecord, error: recordError } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId],
    enabled: !!recordId,
    queryFn: async ({ queryKey }) => {
      // Get the record ID from the queryKey
      const id = queryKey[1];
      if (!id) throw new Error('No record ID provided');
      
      console.log('Fetching record with ID:', id);
      
      // Make direct fetch to ensure we have control over error handling
      const response = await fetch(`/api/quality/material-identification/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load record');
      }
      
      return response.json();
    },
    select: (data: any) => {
      // Debug log to see the raw API response
      console.log('API response data:', data);
      
      // Transform snake_case DB fields to camelCase for the form
      const record = {
        materialIdentificationId: data.material_identification_id,
        projectId: data.project_id,
        projectName: data.project_name,
        projectNumber: data.project_number,
        inspectionOrderNumber: data.inspection_order_number,
        materialDescription: data.material_description,
        materialCode: data.material_code,
        specification: data.specification,
        materialGrade: data.material_grade, 
        heatNumber: data.heat_number,
        batchNumber: data.batch_number || '',
        millName: data.mill_name,
        millTestCertificateNumber: data.mill_test_certificate_number,
        quantity: data.quantity,
        dimensions: data.dimensions,
        materialStatus: data.material_status,
        inspectorName: data.inspector_name,
        inspectionDate: data.inspection_date ? new Date(data.inspection_date) : new Date(),
        remarks: data.remarks || ''
      };
      
      console.log('Transformed record:', record);
      return record;
    }
  });
  
  // Handle record loading error
  useEffect(() => {
    if (recordError) {
      console.error('Error fetching record:', recordError);
      toast({
        title: "Error Loading Record",
        description: recordError instanceof Error ? recordError.message : "Failed to load the Material Identification record.",
        variant: "destructive",
      });
    }
  }, [recordError, toast]);

  // Default values for the form
  const defaultValues: Partial<MaterialIdentificationFormValues> = {
    materialIdentificationId: '',
    projectId: undefined, // Include projectId field
    projectName: '',
    projectNumber: '',
    inspectionOrderNumber: '',
    materialDescription: '',
    materialCode: '',
    specification: '',
    materialGrade: '',
    heatNumber: '',
    batchNumber: '',
    millName: '',
    millTestCertificateNumber: '',
    quantity: '',
    dimensions: '',
    materialStatus: '',
    inspectorName: '',
    inspectionDate: new Date(),
    remarks: ''
  };

  // Use a form key that changes whenever the disabled state or edit mode changes
  // This will completely remount the form with the new disabled state
  const formKey = `form-${isEditMode ? 'edit' : 'view'}-${formDisabled ? 'disabled' : 'enabled'}-${Date.now()}`;
  
  // Initialize form with disabled state explicitly set - NEVER disable for new records
  const shouldDisableForm = isViewMode && !isEditMode && !isNewRecord;
  console.log("Form initialization - shouldDisableForm:", shouldDisableForm, "isNewRecord:", isNewRecord);
  
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues,
    mode: "onBlur",
    disabled: shouldDisableForm // Explicitly set disabled state based on mode
  });
  
  // Use an effect to manually override disabled state for all fields if needed
  useEffect(() => {
    if (isEditMode) {
      // If we're in edit mode but the form is still showing as disabled,
      // manually remove the disabled attribute from all form elements
      console.log("In edit mode - ensuring all fields are enabled");
      setTimeout(() => {
        const formInputs = document.querySelectorAll('input, select, textarea');
        formInputs.forEach((input: Element) => {
          const htmlInput = input as HTMLElement;
          if (htmlInput.hasAttribute('disabled')) {
            htmlInput.removeAttribute('disabled');
            console.log("Manually enabled field:", htmlInput);
          }
        });
      }, 200); // Wait for the DOM to be updated
    }
  }, [isEditMode, formKey]); // Run when edit mode or form key changes
  
  // Log the form's disabled state on every render for debugging
  console.log("Form initialized with - disabled state:", formDisabled, "formKey:", formKey);
  
  useEffect(() => {
    console.log("Edit mode changed:", { isEditMode, formDisabled, key: formKey });
    
    if (form) {
      // If in edit mode, we want to preserve existing values
      if (isEditMode && existingRecord) {
        console.log("Re-initializing form for edit mode with existingRecord");
        // Set the actual form values directly from the server data
        Object.entries(existingRecord).forEach(([key, value]) => {
          if (value === null || value === undefined) return;
          
          // Handle date fields specifically
          if (key === 'inspectionDate' && value) {
            try {
              const dateValue = new Date(value);
              if (!isNaN(dateValue.getTime())) {
                // @ts-ignore: Dynamic key access
                form.setValue(key, dateValue);
              }
            } catch (error) {
              console.error('Error parsing date:', error);
            }
          } else {
            // For non-date fields, set the value directly
            // @ts-ignore: Dynamic key access
            form.setValue(key, value);
          }
        });
      }
    }
  }, [isEditMode, formDisabled, formKey]);

  // Set next MI ID from API (for new records) or populate form with existing data (for edit/view)
  useEffect(() => {
    console.log('nextIdData:', nextIdData, 'isNewRecord:', isNewRecord, 'recordId:', recordId);
    
    // For new records, fetch and set the next MI ID
    if (nextIdData?.nextId && (isNewRecord || !recordId)) {
      console.log('Setting MI ID to:', nextIdData.nextId);
      form.setValue('materialIdentificationId', nextIdData.nextId);
    }
    
    // For existing records (edit/view mode), populate with data from server
    if (existingRecord && recordId && !isNewRecord) {
      console.log('Setting form values from existing record:', existingRecord);
      
      // Reset the form with default values first to clear any previous data
      form.reset(defaultValues);
      
      // Populate form with existing record data
      Object.entries(existingRecord).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        
        // Handle date fields specifically
        if (key === 'inspectionDate' && value) {
          try {
            // Convert string date to Date object
            const dateValue = new Date(value);
            if (!isNaN(dateValue.getTime())) {
              // @ts-ignore: Dynamic key access
              form.setValue(key, dateValue);
            }
          } catch (error) {
            console.error('Error parsing date:', error);
          }
        } else {
          // For non-date fields, set the value directly
          // @ts-ignore: Dynamic key access
          form.setValue(key, value);
        }
      });
      
      // Set selected project for proper dropdown population
      if (existingRecord.projectId) {
        setSelectedProject(existingRecord.projectId);
      }
    }
    
    // For the special "new" case, ensure we reset the form properly with default values
    // and set the auto-generated MI ID
    if (isNewRecord) {
      console.log('Initializing new record form');
      form.reset(defaultValues);
      
      if (nextIdData?.nextId) {
        console.log('Setting MI ID from newly fetched data:', nextIdData.nextId);
        form.setValue('materialIdentificationId', nextIdData.nextId);
      }
    }
  }, [nextIdData, existingRecord, form, recordId, defaultValues, isNewRecord]);

  // Handle project selection
  const handleProjectSelect = (projectId: string) => {
    const id = parseInt(projectId, 10);
    setSelectedProject(id);
    
    // Find project by ID
    const project = projects.find(p => p.id === id);
    if (project) {
      // Store the project info in the form
      // Use code field as the primary identifier from the projects table
      const projectValue = (project.code || project.projectCode || project.projectNumber || '') as string;
      
      // Explicitly set project ID, number, and name
      console.log(`Setting project ID to: ${project.id}`);
      console.log(`Setting project number to: ${projectValue}`);
      console.log(`Setting project name to: ${project.name}`);
      
      // CRITICAL: Set projectId for server-side validation
      form.setValue('projectId', project.id);
      form.setValue('projectNumber', projectValue);
      form.setValue('projectName', project.name);
      
      // This is important - mark fields as touched to ensure they're included in the submission
      form.trigger('projectId');
      form.trigger('projectNumber');
      form.trigger('projectName');
      
      // Debug information about the project data
      console.log('Selected project data:', {
        id: project.id,
        code: project.code,
        projectCode: project.projectCode,
        projectNumber: project.projectNumber,
        name: project.name
      });
      
      console.log('Selected project:', project);
      
      // MI ID is now auto-generated from the server and already set
    }
  };

  // Type for API response
  interface MaterialIdentificationResponse {
    id: number;
    materialIdentificationId: string;
    // other fields as needed
  }

  // Create a mutation for submitting new records
  const createMutation = useMutation<
    MaterialIdentificationResponse, 
    Error, 
    Omit<MaterialIdentificationFormValues, 'inspectionDate'> & { inspectionDate: string }
  >({
    mutationFn: async (formData) => {
      const response = await fetch('/api/quality/material-identification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create material identification record');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Material Identification Submitted",
        description: `MI ID: ${form.getValues().materialIdentificationId} has been created successfully.`,
      });
      
      // Reset form
      form.reset(defaultValues);
      
      // Refetch the next MI ID for the next record
      refetchNextId();
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Create a mutation for updating existing records
  const updateMutation = useMutation<
    MaterialIdentificationResponse, 
    Error, 
    Omit<MaterialIdentificationFormValues, 'inspectionDate'> & { inspectionDate: string, id: string }
  >({
    mutationFn: async (formData) => {
      const response = await fetch(`/api/quality/material-identification/${recordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update material identification record');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Material Identification Updated",
        description: `MI ID: ${form.getValues().materialIdentificationId} has been updated successfully.`,
      });
      
      // Navigate back to the list page
      navigate('/quality/material-identification');
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (data: MaterialIdentificationFormValues) => {
    // Format the inspection date if it's valid
    let formattedDate = '';
    if (data.inspectionDate instanceof Date && !isNaN(data.inspectionDate.getTime())) {
      formattedDate = format(data.inspectionDate, "yyyy-MM-dd");
    } else {
      // Default to today if date is invalid
      formattedDate = format(new Date(), "yyyy-MM-dd");
    }
    
    // Log all form values for debugging
    console.log("Form submission values:", data);
    
    // Make sure projectId is correctly set and not undefined
    if (!data.projectId && selectedProject) {
      console.log("Setting projectId from selectedProject in onSubmit:", selectedProject);
      data.projectId = selectedProject;
    }
    
    // Double-check projectId is available
    if (!data.projectId) {
      toast({
        title: "Missing Project",
        description: "Please select a project before submitting the form.",
        variant: "destructive",
      });
      return;
    }
    
    const formattedData = {
      ...data,
      inspectionDate: formattedDate,
    };
    
    console.log("Submitting formatted data:", formattedData);
    
    // Submit the data to the appropriate mutation based on mode
    if (isEditMode && recordId) {
      updateMutation.mutate({
        ...formattedData,
        id: recordId
      });
    } else {
      // For create, ensure we're explicitly sending projectId
      console.log("Creating new material identification with projectId:", formattedData.projectId);
      createMutation.mutate(formattedData);
    }
  };

  // Loading state while fetching record data
  if (isLoadingRecord && recordId) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-lg">Loading material identification record...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Material Identification</h1>
            <p className="text-muted-foreground mt-2">
              {isEditMode ? 'Edit' : isViewMode ? 'View' : 'Create'} material identification details for quality assurance and traceability.
            </p>
          </div>
          
          <Button 
            variant="outline" 
            onClick={() => navigate('/quality/material-identification')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to List
          </Button>
        </div>
        
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>
              {isEditMode ? 'Edit' : isViewMode ? 'View' : 'Create'} Material Identification Record
            </CardTitle>
            <CardDescription>
              {isEditMode ? 'Update' : isViewMode ? 'View' : 'Fill in all'} the required details for this Material Identification record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form} key={formKey}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* First row: Project No, Project Name, and MI ID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="projectNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project No.</FormLabel>
                        <Select
                          onValueChange={(value) => handleProjectSelect(value)}
                          value={selectedProject?.toString() || ""}
                          disabled={isViewMode && !isEditMode}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select project number" />
                            </SelectTrigger>
                          </FormControl>
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
                          <Input {...field} readOnly={true} />
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
                          <Input {...field} readOnly={true} />
                        </FormControl>
                        <FormDescription>
                          Format: MI-YYYY-N (Year-Sequence)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Inspection Order Number row has been removed */}
                
                {/* Third row: Material details */}
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
                
                {/* Fourth row: Specification and Material Grade */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="specification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specification</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.trigger('specification');
                            console.log(`Setting specification to: ${value}`);
                          }}
                          value={field.value || ""}
                          disabled={formDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
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
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.trigger('materialGrade');
                            console.log(`Setting material grade to: ${value}`);
                          }}
                          value={field.value || ""}
                          disabled={formDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select material grade" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="SA-516 Gr 60">SA-516 Gr 60</SelectItem>
                            <SelectItem value="SA-516 Gr 70">SA-516 Gr 70</SelectItem>
                            <SelectItem value="SA-106 Gr B">SA-106 Gr B</SelectItem>
                            <SelectItem value="SA-106 Gr C">SA-106 Gr C</SelectItem>
                            <SelectItem value="SA-36">SA-36</SelectItem>
                            <SelectItem value="SA-537 Cl 1">SA-537 Cl 1</SelectItem>
                            <SelectItem value="SA-537 Cl 2">SA-537 Cl 2</SelectItem>
                            <SelectItem value="SA-240 Type 304">SA-240 Type 304</SelectItem>
                            <SelectItem value="SA-240 Type 316">SA-240 Type 316</SelectItem>
                            <SelectItem value="SA-312 TP304">SA-312 TP304</SelectItem>
                            <SelectItem value="SA-312 TP316">SA-312 TP316</SelectItem>
                            <SelectItem value="SA-387 Gr 11 Cl 2">SA-387 Gr 11 Cl 2</SelectItem>
                            <SelectItem value="SA-387 Gr 22 Cl 2">SA-387 Gr 22 Cl 2</SelectItem>
                            <SelectItem value="SA-213 TP304">SA-213 TP304</SelectItem>
                            <SelectItem value="SA-213 TP316">SA-213 TP316</SelectItem>
                            <SelectItem value="API 5L Gr B">API 5L Gr B</SelectItem>
                            <SelectItem value="API 5L X42">API 5L X42</SelectItem>
                            <SelectItem value="API 5L X52">API 5L X52</SelectItem>
                            <SelectItem value="ASTM A36">ASTM A36</SelectItem>
                            <SelectItem value="ASTM A106 Gr B">ASTM A106 Gr B</SelectItem>
                            <SelectItem value="ASTM A333 Gr 6">ASTM A333 Gr 6</SelectItem>
                            <SelectItem value="ASTM A515 Gr 70">ASTM A515 Gr 70</SelectItem>
                            <SelectItem value="Gr.B">Gr.B</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Fifth row: Heat Number and Batch Number */}
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
                
                {/* Sixth row: Mill Name and MTC Number */}
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
                
                {/* Seventh row: Quantity and Dimensions */}
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
                
                {/* Eighth row: Material Status */}
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="materialStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Status</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.trigger('materialStatus');
                            console.log(`Setting material status to: ${value}`);
                          }}
                          value={field.value || ""}
                          disabled={formDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
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
                
                {/* Ninth row: Inspector's Name and Inspection Date */}
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
                                disabled={formDisabled}
                              >
                                {field.value instanceof Date && !isNaN(field.value.getTime()) ? (
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
                              selected={field.value instanceof Date && !isNaN(field.value.getTime()) ? field.value : undefined}
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
                
                {/* Tenth row: Remarks */}
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
                
                <div className="flex justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/quality/material-identification')}
                  >
                    Back to List
                  </Button>
                  
                  <div className="flex space-x-2">
                    {!formDisabled && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => form.reset(isEditMode ? existingRecord : defaultValues)}
                        >
                          {isEditMode ? 'Reset Changes' : 'Clear Form'}
                        </Button>
                        <Button 
                          type="submit"
                          onClick={(e) => {
                            e.preventDefault();
                            console.log("Submit button clicked");
                            
                            // Log the current form values
                            const formValues = form.getValues();
                            console.log("Current form values:", formValues);
                            
                            // Make sure projectId is included
                            if (!formValues.projectId) {
                              if (selectedProject) {
                                console.log("Setting projectId from selectedProject:", selectedProject);
                                form.setValue('projectId', selectedProject);
                              } else {
                                toast({
                                  title: "Missing Project",
                                  description: "Please select a project before submitting the form.",
                                  variant: "destructive",
                                });
                                return;
                              }
                            }
                            
                            // Mark all fields as touched to ensure they're included in validation and submission
                            Object.keys(formValues).forEach(fieldName => {
                              form.trigger(fieldName as any);
                            });
                            
                            // Submit the form
                            form.handleSubmit(onSubmit)();
                          }}
                        >
                          {isEditMode ? 'Update' : 'Create'} Material Identification
                        </Button>
                        {isEditMode && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              // First, revert to the original data from the server (if any)
                              if (existingRecord) {
                                form.reset(existingRecord);
                              }
                              
                              // Cancel edit mode by changing URL (which will trigger React state updates)
                              navigate(`/quality/material-identification/${recordId}`);
                              
                              toast({
                                title: "Edit Mode Canceled",
                                description: "No changes were saved.",
                              });
                              
                              console.log("Edit mode canceled by changing URL to remove ?edit=true");
                            }}
                          >
                            Cancel Edit
                          </Button>
                        )}
                      </>
                    )}
                    
                    {isViewMode && (
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => {
                          // Direct state manipulation instead of URL parameters
                          console.log("Edit button clicked - enabling edit mode");
                          setIsEditModeState(true);
                          setFormDisabled(false);
                          
                          // Manual form field enabling via DOM
                          setTimeout(() => {
                            console.log("Manually enabling all form fields");
                            const formInputs = document.querySelectorAll('input, select, textarea');
                            formInputs.forEach((input: Element) => {
                              const htmlInput = input as HTMLElement;
                              if (htmlInput.hasAttribute('disabled')) {
                                htmlInput.removeAttribute('disabled');
                                console.log("Enabled field:", htmlInput);
                              }
                            });
                            
                            // Force the form to completely reset with the current values but not disabled
                            const currentValues = form.getValues();
                            form.reset(currentValues);
                          }, 50);
                          
                          toast({
                            title: "Edit Mode Activated",
                            description: "You can now make changes to this record.",
                          });
                        }}
                      >
                        Edit Record
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}