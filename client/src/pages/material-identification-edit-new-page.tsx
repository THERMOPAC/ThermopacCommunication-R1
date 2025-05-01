import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, FileText, FileUp, Download, Trash2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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

interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
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
  created_at: string;
  updated_at: string;
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

interface MaterialIdentificationEditProps {
  params: {
    id: string;
  };
}

export default function MaterialIdentificationEditNewPage({ params }: MaterialIdentificationEditProps) {
  const [, navigate] = useLocation();
  const recordId = params.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State to track select field values
  const [specificationValue, setSpecificationValue] = useState("");
  const [materialGradeValue, setMaterialGradeValue] = useState("");
  const [materialStatusValue, setMaterialStatusValue] = useState("");
  
  // State for document upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Fetch the Material Identification record
  const { data: recordData, isLoading: isLoadingRecord, error } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/quality/material-identification/${recordId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch material identification record');
      }
      return response.json();
    },
    enabled: !!recordId && recordId !== 'new',
  });
  
  // Get all projects for dropdown
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
  
  // Fetch documents for this material identification record
  const { data: documents = [], isLoading: isLoadingDocuments, refetch: refetchDocuments } = useQuery<Document[]>({
    queryKey: ['/api/quality/material-identification', recordId, 'documents'],
    queryFn: async () => {
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch material identification documents');
      }
      return response.json();
    },
    enabled: !!recordId && recordId !== 'new',
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
  
  // Update form with record data when loaded
  useEffect(() => {
    if (recordData) {
      console.log("Record data loaded:", recordData);
      
      // Transform API response to match form field names
      const formattedData = {
        materialIdentificationId: recordData.material_identification_id,
        projectId: recordData.project_id,
        projectName: recordData.project_name,
        projectNumber: recordData.project_number,
        inspectionOrderNumber: recordData.inspection_order_number,
        materialDescription: recordData.material_description,
        materialCode: recordData.material_code,
        specification: recordData.specification,
        materialGrade: recordData.material_grade,
        heatNumber: recordData.heat_number,
        batchNumber: recordData.batch_number || "",
        millName: recordData.mill_name,
        millTestCertificateNumber: recordData.mill_test_certificate_number,
        quantity: recordData.quantity,
        dimensions: recordData.dimensions,
        materialStatus: recordData.material_status,
        inspectorName: recordData.inspector_name,
        inspectionDate: new Date(recordData.inspection_date),
        remarks: recordData.remarks || "",
      };
      
      console.log("Formatted form data:", formattedData);
      
      // Reset form with formatted data
      form.reset(formattedData);
      
      // Manually set each dropdown field to ensure they're properly updated
      form.setValue("specification", formattedData.specification);
      form.setValue("materialStatus", formattedData.materialStatus);
      form.setValue("materialGrade", formattedData.materialGrade);
      
      // Also set our state variables
      setSpecificationValue(formattedData.specification);
      setMaterialGradeValue(formattedData.materialGrade);
      setMaterialStatusValue(formattedData.materialStatus);
      
      console.log("Set dropdown values:", {
        specification: formattedData.specification,
        materialGrade: formattedData.materialGrade,
        materialStatus: formattedData.materialStatus
      });
    }
  }, [recordData, form]);
  
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
  
  // Handle form submission - completely rebuilt version
  const onSubmit = async (data: MaterialIdentificationFormValues) => {
    try {
      console.log("Starting form submission");
      
      // Gather all form data with explicit values from state
      const formData = {
        // Required fields from the server schema
        materialIdentificationId: data.materialIdentificationId,
        projectId: data.projectId,
        projectNumber: data.projectNumber,
        projectName: data.projectName,
        
        // All other fields with explicit values
        inspectionOrderNumber: data.inspectionOrderNumber || "",
        materialDescription: data.materialDescription,
        materialCode: data.materialCode,
        
        // Use state values for dropdowns to ensure they're always included
        specification: specificationValue,
        materialGrade: materialGradeValue,
        materialStatus: materialStatusValue,
        
        heatNumber: data.heatNumber,
        batchNumber: data.batchNumber || "",
        millName: data.millName,
        millTestCertificateNumber: data.millTestCertificateNumber,
        quantity: data.quantity,
        dimensions: data.dimensions,
        inspectorName: data.inspectorName,
        inspectionDate: format(data.inspectionDate, 'yyyy-MM-dd'),
        remarks: data.remarks || ""
      };
      
      // Debug logging
      console.log("==== DIRECT SUBMISSION DATA ====");
      console.log("All fields being submitted:", Object.keys(formData));
      console.log("Final data for API:", JSON.stringify(formData, null, 2));
      
      // Make a direct API request with explicit data
      const response = await fetch(`/api/quality/material-identification/${recordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      // Store the response text for error handling
      let responseText = "";
      let parsedResponse = null;
      
      try {
        // Try to get and parse the response
        responseText = await response.text();
        console.log("Raw API response:", responseText);
        
        if (responseText) {
          parsedResponse = JSON.parse(responseText);
          console.log("Parsed API response:", parsedResponse);
        }
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
      }
      
      // Handle the response
      if (response.ok) {
        toast({
          title: "Success",
          description: `Material Identification ${formData.materialIdentificationId} has been updated successfully.`,
        });
        
        // Option 1: Refresh page to get the latest data instead of navigating
        window.location.reload();
        
        // Option 2: Uncomment to navigate to view page instead
        // navigate(`/quality/material-identification/view/${recordId}`);
      } else {
        // Show error information
        console.error("API Error Status:", response.status);
        console.error("API Error Response:", responseText);
        
        toast({
          title: "Update Failed",
          description: "Could not update the Material Identification record. See console for details.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Exception during update:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // File input reference for document upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle document upload
  const handleDocumentUpload = async () => {
    if (!selectedFile || !documentType) {
      toast({
        title: "Missing information",
        description: "Please select a file and specify the document type.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", documentType);
      formData.append("description", documentDescription || "");
      
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload document: ${errorText}`);
      }
      
      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
      
      // Reset form
      setSelectedFile(null);
      setDocumentType("");
      setDocumentDescription("");
      setUploadDialogOpen(false);
      
      // Refresh documents list
      refetchDocuments();
      
    } catch (error) {
      console.error("Document upload error:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload document.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async (documentId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) {
      return;
    }
    
    try {
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents/${documentId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete document");
      }
      
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
      
      // Refresh documents list
      refetchDocuments();
      
    } catch (error) {
      console.error("Document deletion error:", error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete the document.",
        variant: "destructive",
      });
    }
  };

  // Handle document download
  const handleDownloadDocument = async (documentId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/quality/material-identification/${recordId}/documents/${documentId}/download`);
      
      if (!response.ok) {
        throw new Error("Failed to download document");
      }
      
      // Get file content as blob
      const blob = await response.blob();
      
      // Create object URL
      const url = window.URL.createObjectURL(blob);
      
      // Create temporary link and trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error("Document download error:", error);
      toast({
        title: "Download Failed",
        description: "Failed to download the document.",
        variant: "destructive",
      });
    }
  };
  
  const isLoading = isLoadingRecord || isLoadingProjects || isLoadingDocuments;
  
  if (error) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>
                Failed to load the Material Identification record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>There was an error loading this record. Please try again or contact support.</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => navigate('/quality/material-identification')}
              >
                Back to List
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Edit Material Identification Record</CardTitle>
            <CardDescription>
              Update the details for this Material Identification record.
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
                      name="projectId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Project No.</FormLabel>
                          <Select
                            value={field.value?.toString()}
                            onValueChange={handleProjectSelect}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
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
                            value={specificationValue}
                            onValueChange={(value) => {
                              setSpecificationValue(value);
                              field.onChange(value);
                            }}
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
                            value={materialGradeValue}
                            onValueChange={(value) => {
                              setMaterialGradeValue(value);
                              field.onChange(value);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
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
                            value={materialStatusValue}
                            onValueChange={(value) => {
                              setMaterialStatusValue(value);
                              field.onChange(value);
                            }}
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
                      onClick={() => navigate(`/quality/material-identification/view/${recordId}`)}
                    >
                      Cancel
                    </Button>
                    
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => form.reset()}
                      >
                        Reset Changes
                      </Button>
                      <Button type="submit">
                        Update Material Identification
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
        
        {/* Document Management Section (if record is loaded) */}
        {!isLoading && recordData && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Documents</CardTitle>
                <CardDescription>
                  Manage documents related to this Material Identification record.
                </CardDescription>
              </div>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
                    <FileUp className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Document</DialogTitle>
                    <DialogDescription>
                      Add a document to this Material Identification record.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="documentType" className="text-right">
                        Document Type *
                      </Label>
                      <Select 
                        value={documentType} 
                        onValueChange={setDocumentType}
                      >
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mill Test Certificate">Mill Test Certificate</SelectItem>
                          <SelectItem value="Inspection Report">Inspection Report</SelectItem>
                          <SelectItem value="Chemical Analysis">Chemical Analysis</SelectItem>
                          <SelectItem value="Mechanical Test">Mechanical Test</SelectItem>
                          <SelectItem value="Certificate of Conformity">Certificate of Conformity</SelectItem>
                          <SelectItem value="Certificate of Origin">Certificate of Origin</SelectItem>
                          <SelectItem value="Material Certificate">Material Certificate</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="description" className="text-right">
                        Description
                      </Label>
                      <Input
                        id="description"
                        placeholder="Enter document description"
                        className="col-span-3"
                        value={documentDescription}
                        onChange={(e) => setDocumentDescription(e.target.value)}
                      />
                    </div>
                    
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="file" className="text-right">
                        File *
                      </Label>
                      <div className="col-span-3">
                        <Input
                          id="file"
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                        />
                        {selectedFile && (
                          <p className="text-sm text-gray-500 mt-1">
                            Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setUploadDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      type="button" 
                      onClick={handleDocumentUpload}
                      disabled={isUploading || !selectedFile || !documentType}
                    >
                      {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            
            <CardContent>
              {isLoadingDocuments ? (
                <div className="flex justify-center items-center h-20">
                  <span className="loading loading-spinner text-primary"></span>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No documents available</p>
                  <p className="text-sm">Click "Upload Document" to add files to this record.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Document Name</th>
                        <th className="text-left py-3 px-4 font-medium">Type</th>
                        <th className="text-left py-3 px-4 font-medium">Description</th>
                        <th className="text-left py-3 px-4 font-medium">Uploaded On</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="py-3 px-4">{doc.file_name}</td>
                          <td className="py-3 px-4">{doc.document_type}</td>
                          <td className="py-3 px-4">{doc.description || "-"}</td>
                          <td className="py-3 px-4">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadDocument(doc.id, doc.file_name)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteDocument(doc.id)}
                              title="Delete"
                              className="text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}