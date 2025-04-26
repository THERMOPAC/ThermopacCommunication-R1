import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Info } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

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

export default function MaterialIdentificationPage() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  
  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ['/api/projects'],
  });
  
  // Fetch inspection orders for the selected project
  const { data: inspectionOrders } = useQuery({
    queryKey: ['/api/quality/inspection-orders/project', selectedProject],
    enabled: !!selectedProject,
  });

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

  // Initialize form
  const form = useForm<MaterialIdentificationFormValues>({
    resolver: zodResolver(materialIdentificationSchema),
    defaultValues,
  });

  // Function to generate a new MI ID when selecting a project
  const generateMaterialIdentificationId = (projectNo: string) => {
    if (!projectNo) return '';
    return `MI-${projectNo}`;
  };

  // Handle project selection
  const handleProjectSelect = (projectId: string) => {
    const id = parseInt(projectId, 10);
    setSelectedProject(id);
    
    // Find project by ID
    const project = projects?.find((p: any) => p.id === id);
    if (project) {
      form.setValue('projectName', project.name);
      form.setValue('projectNumber', project.projectNumber);
      
      // Generate MI ID based on project number
      const miId = generateMaterialIdentificationId(project.projectNumber);
      form.setValue('materialIdentificationId', miId);
    }
  };

  // Handle form submission
  const onSubmit = (data: MaterialIdentificationFormValues) => {
    console.log("Form submitted:", data);
    
    // Format the inspection date
    const formattedData = {
      ...data,
      inspectionDate: format(data.inspectionDate, "yyyy-MM-dd"),
    };
    
    // TODO: Add API call to save the data
    // Currently showing success toast for demonstration
    toast({
      title: "Material Identification Submitted",
      description: `MI ID: ${data.materialIdentificationId} has been created.`,
    });
    
    // Reset form
    form.reset(defaultValues);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Material Identification</h1>
          <p className="text-muted-foreground mt-2">
            Record material identification details for quality assurance and traceability.
          </p>
        </div>
        
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Material Identification Form</CardTitle>
            <CardDescription>
              Fill in all the required details to create a new Material Identification record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* First row: Project selector, Project details, and MI ID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="projectName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select
                          onValueChange={(value) => handleProjectSelect(value)}
                          defaultValue=""
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects?.map((project: any) => (
                              <SelectItem key={project.id} value={project.id.toString()}>
                                {project.name} ({project.projectNumber})
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
                    name="materialIdentificationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MI ID</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly />
                        </FormControl>
                        <FormDescription>
                          Automatically generated
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
                          defaultValue={field.value}
                          disabled={!selectedProject}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an inspection order" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {inspectionOrders?.map((order: any) => (
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
                        <FormControl>
                          <Input {...field} placeholder="e.g., ASTM / ASME / API Standard" />
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
                          <Input {...field} placeholder="e.g., SA-516 Gr 70" />
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
                          defaultValue={field.value}
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
                
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.reset(defaultValues)}
                  >
                    Reset
                  </Button>
                  <Button type="submit">Create Material Identification</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}