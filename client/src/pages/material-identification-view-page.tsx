import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";

// Define the form schema (same as in the original file)
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

export default function MaterialIdentificationViewPage({ params }: { params?: { id?: string } }) {
  const { toast } = useToast();
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
  
  // Initialize form with disabled state since this is view-only
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues,
    mode: "onBlur",
    disabled: true // Always disabled since this is view-only
  });

  // Fetch existing record
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
    }
  }, [existingRecord, form, recordId, defaultValues]);

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
              View material identification details for quality assurance and traceability.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/quality/material-identification')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Button>
            
            <Button 
              variant="default" 
              onClick={() => navigate(`/quality/material-identification/edit/${recordId}`)}
              className="flex items-center gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit Record
            </Button>
          </div>
        </div>
        
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>
              View Material Identification Record
            </CardTitle>
            <CardDescription>
              Details for Material Identification: {form.getValues().materialIdentificationId || ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form className="space-y-6">
                {/* First row: Project No, Project Name, and MI ID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="projectNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project No.</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly />
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
                
                {/* Second row: Inspection Order Number */}
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="inspectionOrderNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Order No.</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly />
                        </FormControl>
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                          <Input {...field} readOnly />
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
                        <FormControl>
                          <Input {...field} readOnly />
                        </FormControl>
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
                          <Input {...field} readOnly />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="inspectionDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Date</FormLabel>
                        <FormControl>
                          <Input 
                            value={field.value instanceof Date 
                              ? field.value.toLocaleDateString() 
                              : ''
                            } 
                            readOnly 
                          />
                        </FormControl>
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
                          <Textarea {...field} readOnly />
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