import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Save, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Define the form schema
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string().min(1, "MI ID is required"),
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

// Edit page component
export default function MaterialIdentificationEditPage({ params }: { params?: { id?: string } }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedProject, setSelectedProject] = React.useState<number | null>(null);
  
  // Extract ID from route params
  const recordId = params?.id;
  
  // Define types for API responses
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
  
  // Default form values
  const defaultValues = React.useMemo<Partial<MaterialIdentificationFormValues>>(() => ({
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
  }), []);

  // Initialize form
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues,
    mode: "onBlur"
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  // Fetch inspection orders for selected project
  const { data: inspectionOrders = [] } = useQuery<InspectionOrder[]>({
    queryKey: ['/api/quality/inspection-orders/project', selectedProject],
    enabled: !!selectedProject,
  });

  // Fetch existing record
  const { 
    data: existingRecord, 
    isLoading: isLoadingRecord, 
    error: recordError 
  } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId],
    enabled: !!recordId,
    queryFn: async () => {
      if (!recordId) throw new Error('No record ID provided');
      
      const response = await fetch(`/api/quality/material-identification/${recordId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load record');
      }
      
      const data = await response.json();
      
      // Transform the data for the form
      return {
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
    }
  });
  
  // Handle record loading error
  React.useEffect(() => {
    if (recordError) {
      toast({
        title: "Error Loading Record",
        description: recordError instanceof Error ? recordError.message : "Failed to load the record",
        variant: "destructive",
      });
    }
  }, [recordError, toast]);

  // Set form values when record is loaded
  React.useEffect(() => {
    if (existingRecord && recordId) {
      // Set form values
      form.reset(existingRecord);
      
      // Set selected project
      if (existingRecord.projectId) {
        setSelectedProject(existingRecord.projectId);
      }
    }
  }, [existingRecord, form, recordId]);

  // Handle project selection
  const handleProjectSelect = (projectId: string) => {
    const id = parseInt(projectId, 10);
    setSelectedProject(id);
    
    // Find project data
    const project = projects.find(p => p.id === id);
    if (project) {
      // Update form with project data
      const projectValue = (project.code || project.projectCode || project.projectNumber || '') as string;
      form.setValue('projectNumber', projectValue);
      form.setValue('projectName', project.name);
    }
  };

  // Create mutation for update
  const updateMutation = useMutation({
    mutationFn: async (formData: any) => {
      const response = await fetch(`/api/quality/material-identification/${recordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update record');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Material Identification Updated",
        description: `MI ID: ${form.getValues().materialIdentificationId} has been updated successfully.`,
      });
      
      // Navigate back to view page
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
    // Format inspection date
    let formattedDate = '';
    if (data.inspectionDate instanceof Date && !isNaN(data.inspectionDate.getTime())) {
      formattedDate = format(data.inspectionDate, "yyyy-MM-dd");
    } else {
      formattedDate = format(new Date(), "yyyy-MM-dd");
    }
    
    // Format data and update
    const formattedData = {
      ...data,
      inspectionDate: formattedDate,
      id: recordId
    };
    
    updateMutation.mutate(formattedData);
  };

  // Show loading state
  if (isLoadingRecord) {
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
              disabled={updateMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
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
                          <Input {...field} readOnly />
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
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
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
                          <Input {...field} />
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
                          <Input {...field} />
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
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Eighth row: Material Status and Inspector Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="materialStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select material status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Accepted">Accepted</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                            <SelectItem value="On Hold">On Hold</SelectItem>
                            <SelectItem value="Pending Inspection">Pending Inspection</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="inspectorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspector Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Ninth row: Inspection Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                variant="outline"
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
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}