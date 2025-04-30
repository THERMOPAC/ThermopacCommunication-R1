import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ArrowLeft, Save, X } from "lucide-react";

// Define the form schema
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string().min(1, "MI ID is required"),
  projectName: z.string().min(1, "Project Name is required"),
  projectNumber: z.string().min(1, "Project Number is required"),
  inspectionOrderNumber: z.string().min(1, "Inspection Order Number is required"),
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

export default function MaterialIdentificationEditPage({ params }: { params?: { id?: string } }) {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [location, navigate] = useLocation();
  
  // Extract ID from route params
  const recordId = params?.id;
  
  // Default values for the form
  const defaultValues: Partial<MaterialIdentificationFormValues> = {
    materialIdentificationId: '',
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
  
  // Initialize form - explicitly not disabled since this is the edit page
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues,
    mode: "onBlur",
  });

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

  // Fetch existing record for edit
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

  // Populate form with existing data once it's available
  useEffect(() => {
    if (existingRecord && recordId) {
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
  }, [existingRecord, form, recordId, defaultValues]);

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
      form.setValue('projectNumber', projectValue);
      
      // Debug information about the project data
      console.log('Selected project data:', {
        id: project.id,
        code: project.code,
        projectCode: project.projectCode,
        projectNumber: project.projectNumber,
        name: project.name
      });
      form.setValue('projectName', project.name);
      
      console.log('Selected project:', project);
    }
  };

  // Type for API response
  interface MaterialIdentificationResponse {
    id: number;
    materialIdentificationId: string;
    // other fields as needed
  }

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
      
      // Navigate back to the view page
      navigate(`/quality/material-identification/view/${recordId}`);
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
    
    const formattedData = {
      ...data,
      inspectionDate: formattedDate,
    };
    
    // Submit the data to update the record
    updateMutation.mutate({
      ...formattedData,
      id: recordId || ''
    });
  };

  // Loading state while fetching record data
  if (isLoadingRecord && recordId) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-lg">Loading material identification record for editing...</p>
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
              Edit material identification details for quality assurance and traceability.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate(`/quality/material-identification/view/${recordId}`)}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            
            <Button 
              variant="default" 
              onClick={form.handleSubmit(onSubmit)}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
        
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>
              Edit Material Identification Record
            </CardTitle>
            <CardDescription>
              Edit details for Material Identification: {form.getValues().materialIdentificationId || ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
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
                
                {/* Second row: Inspection Order Number */}
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="inspectionOrderNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Order No.</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={!selectedProject}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an inspection order" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {inspectionOrders.map((order) => (
                              <SelectItem key={order.id} value={order.inspectionOrderNumber}>
                                {order.inspectionOrderNumber} - {order.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
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
                          onValueChange={field.onChange}
                          value={field.value || ""}
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
                          onValueChange={field.onChange}
                          value={field.value || ""}
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
                          onValueChange={field.onChange}
                          value={field.value || ""}
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
                
                {/* Ninth row: Inspector Name and Inspection Date */}
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
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
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
                
                {/* Tenth row: Remarks */}
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Remarks</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Action buttons */}
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    type="button"
                    onClick={() => navigate(`/quality/material-identification/view/${recordId}`)}
                  >
                    Cancel
                  </Button>
                  
                  <Button type="submit">
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}