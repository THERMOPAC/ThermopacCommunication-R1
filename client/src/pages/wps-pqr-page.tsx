import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { FileText, Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";

// Define the WPS form schema
const wpsFormSchema = z.object({
  wpsId: z.string().min(1, "WPS ID is required"),
  materialType: z.string().min(1, "Material Type is required"),
  materialGrade: z.string().min(1, "Material Grade is required"),
  weldingProcess: z.string().min(1, "Welding Process is required"),
  weldingPosition: z.string().min(1, "Welding Position is required"),
  fillerMaterial: z.string().min(1, "Filler Material is required"),
  shieldingGas: z.string().optional(),
  preheatTemperature: z.string().min(1, "Preheat Temperature is required"),
  interpassTemperature: z.string().min(1, "Interpass Temperature is required"),
  pwht: z.string().min(1, "PWHT selection is required"),
  pwhtDetails: z.string().optional(),
  visualInspection: z.boolean().default(false),
  mechanicalTest: z.boolean().default(false),
  remarks: z.string().optional(),
});

// Define the PQR form schema
const pqrFormSchema = z.object({
  pqrId: z.string().min(1, "PQR ID is required"),
  relatedWpsId: z.string().min(1, "Related WPS ID is required"),
  testSpecimenMaterial: z.string().min(1, "Test Specimen Material is required"),
  testSpecimenThickness: z.string().min(1, "Test Specimen Thickness is required"),
  voltage: z.string().min(1, "Voltage is required"),
  amperage: z.string().min(1, "Amperage is required"),
  travelSpeed: z.string().min(1, "Travel Speed is required"),
  wireFeedSpeed: z.string().min(1, "Wire Feed Speed is required"),
  weldingPosition: z.string().min(1, "Welding Position is required"),
  fillerMaterial: z.string().min(1, "Filler Material is required"),
  shieldingGas: z.string().min(1, "Shielding Gas is required"),
  preheatTemperature: z.string().min(1, "Preheat Temperature is required"),
  pwht: z.string().min(1, "PWHT selection is required"),
  mechanicalTestResults: z.string().min(1, "Mechanical Test Results are required"),
  visualInspectionResult: z.string().min(1, "Visual Inspection Result is required"),
  ndtRequirements: z.string().min(1, "NDT Requirements are required"),
  remarks: z.string().optional(),
});

type WpsFormValues = z.infer<typeof wpsFormSchema>;
type PqrFormValues = z.infer<typeof pqrFormSchema>;

export default function WpsPqrPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("wps");
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [match, params] = useRoute("/wps-pqr/:id?");
  
  // File upload states
  const [wpsFile, setWpsFile] = useState<File | null>(null);
  const [pqrFile, setPqrFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Generate a sequential ID for WPS/PQR
  const generateSequentialId = () => {
    // In a real implementation, this would fetch the next available ID from the server
    // For now, we'll use a random 3-digit number for demonstration
    const sequentialNumber = String(Math.floor(100 + Math.random() * 900)).padStart(3, '0');
    return sequentialNumber;
  };
  
  // Get ID from params or generate a new one
  const documentId = params?.id || generateSequentialId();
  const wpsId = `WPS-${documentId}`;
  const pqrId = `PQR-${documentId}`;
  
  // Fetch existing WPS data
  const { data: wpsData, isLoading: isLoadingWps } = useQuery({
    queryKey: ['/api/quality/wps'],
    // The API does not exist yet, so we'll disable it to prevent errors
    enabled: false,
  });
  
  // Fetch specific WPS data if ID is provided
  const { data: specificWps, isLoading: isLoadingSpecificWps } = useQuery({
    queryKey: ['/api/quality/wps', documentId],
    enabled: !!params?.id && false, // Disabled for now
  });
  
  // Fetch specific PQR data if ID is provided
  const { data: specificPqr, isLoading: isLoadingSpecificPqr } = useQuery({
    queryKey: ['/api/quality/pqr', documentId],
    enabled: !!params?.id && false, // Disabled for now
  });
  
  // Default values for WPS form
  const wpsDefaultValues: Partial<WpsFormValues> = {
    wpsId: wpsId,
    materialType: "",
    materialGrade: "",
    weldingProcess: "",
    weldingPosition: "",
    fillerMaterial: "",
    shieldingGas: "",
    preheatTemperature: "",
    interpassTemperature: "",
    pwht: "No",
    pwhtDetails: "",
    visualInspection: false,
    mechanicalTest: false,
    remarks: "",
  };

  // Default values for PQR form
  const pqrDefaultValues: Partial<PqrFormValues> = {
    pqrId: pqrId,
    relatedWpsId: wpsId, // Set the related WPS ID to match
    testSpecimenMaterial: "",
    testSpecimenThickness: "",
    voltage: "",
    amperage: "",
    travelSpeed: "",
    wireFeedSpeed: "",
    weldingPosition: "",
    fillerMaterial: "",
    shieldingGas: "",
    preheatTemperature: "",
    pwht: "No",
    mechanicalTestResults: "",
    visualInspectionResult: "Pass",
    ndtRequirements: "",
    remarks: "",
  };

  // Initialize WPS form
  const wpsForm = useForm<WpsFormValues>({
    resolver: zodResolver(wpsFormSchema),
    defaultValues: wpsDefaultValues,
  });

  // Initialize PQR form
  const pqrForm = useForm<PqrFormValues>({
    resolver: zodResolver(pqrFormSchema),
    defaultValues: pqrDefaultValues,
  });
  
  // Update forms with specific data if available
  useEffect(() => {
    if (specificWps) {
      wpsForm.reset(specificWps);
    }
    
    if (specificPqr) {
      pqrForm.reset(specificPqr);
    }
  }, [specificWps, specificPqr, wpsForm, pqrForm]);
  
  // Effect to handle URL parameters
  useEffect(() => {
    // If URL contains an ID, open the correct tab based on the active view
    // This could be enhanced to auto-switch to the PQR tab when viewing an existing entry
    if (params?.id && location.includes('/pqr')) {
      setActiveTab('pqr');
    }
  }, [params, location]);

  // WPS form submission handler
  const onWpsSubmit = async (data: WpsFormValues) => {
    console.log("WPS Form submitted:", data);
    
    try {
      // TODO: Add API call to save the WPS data
      // const response = await apiRequest('POST', '/api/quality/wps', data);
      // const savedWps = await response.json();
      
      // For now, simulate successful save
      const savedWps = { ...data };
      
      // Show success message
      toast({
        title: "WPS Created Successfully",
        description: `WPS ID: ${data.wpsId} has been created along with a corresponding PQR.`,
      });
      
      // Switch to PQR tab to complete the linked record
      setActiveTab("pqr");
      
      // Prefill PQR form with some values from WPS
      pqrForm.setValue("pqrId", pqrId);
      pqrForm.setValue("relatedWpsId", data.wpsId);
      pqrForm.setValue("weldingPosition", data.weldingPosition);
      pqrForm.setValue("fillerMaterial", data.fillerMaterial);
      pqrForm.setValue("shieldingGas", data.shieldingGas || "");
      pqrForm.setValue("preheatTemperature", data.preheatTemperature);
      pqrForm.setValue("pwht", data.pwht);
      
      // Update the URL to include the document ID
      if (!params?.id) {
        setLocation(`/wps-pqr/${documentId}`, { replace: true });
      }
      
      // In a real implementation, invalidate queries
      // queryClient.invalidateQueries(['/api/quality/wps']);
    } catch (error) {
      console.error("Error saving WPS:", error);
      toast({
        title: "Error",
        description: "Failed to create WPS. Please try again.",
        variant: "destructive",
      });
    }
  };

  // PQR form submission handler
  const onPqrSubmit = async (data: PqrFormValues) => {
    console.log("PQR Form submitted:", data);
    
    try {
      // TODO: Add API call to save the PQR data
      // const response = await apiRequest('POST', '/api/quality/pqr', data);
      // const savedPqr = await response.json();
      
      // For now, simulate successful save
      const savedPqr = { ...data };
      
      toast({
        title: "PQR Created Successfully",
        description: `PQR ID: ${data.pqrId} has been created and linked to ${data.relatedWpsId}.`,
      });
      
      // In a real implementation, invalidate queries
      // queryClient.invalidateQueries(['/api/quality/pqr']);
      
      // Reset forms with new IDs for the next entry
      const newId = generateSequentialId();
      const newWpsId = `WPS-${newId}`;
      const newPqrId = `PQR-${newId}`;
      
      wpsForm.reset({
        ...wpsDefaultValues,
        wpsId: newWpsId
      });
      
      pqrForm.reset({
        ...pqrDefaultValues,
        pqrId: newPqrId,
        relatedWpsId: newWpsId
      });
      
      // Update the URL to remove the ID
      setLocation('/wps-pqr', { replace: true });
    } catch (error) {
      console.error("Error saving PQR:", error);
      toast({
        title: "Error",
        description: "Failed to create PQR. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update PWHT Details field visibility based on PWHT selection
  const showPwhtDetails = wpsForm.watch("pwht") === "Yes";
  
  // File upload handler for WPS and PQR documents
  const handleDocumentUpload = async () => {
    if (!wpsFile && !pqrFile) {
      toast({
        title: "Error",
        description: "Please select at least one file to upload.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadProgress(10);
      
      // Create form data for the upload
      const formData = new FormData();
      
      if (wpsFile) {
        formData.append('wpsFile', wpsFile);
        formData.append('wpsId', wpsId);
      }
      
      if (pqrFile) {
        formData.append('pqrFile', pqrFile);
        formData.append('pqrId', pqrId);
      }
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + 15;
          if (newProgress >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return newProgress;
        });
      }, 500);
      
      // TODO: Implement actual file upload API call
      // const response = await apiRequest('POST', '/api/quality/wps-pqr/documents', formData, { 
      //   isFormData: true 
      // });
      
      // For demo, simulate a successful upload after 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus('success');
      
      toast({
        title: "Files Uploaded Successfully",
        description: "Your WPS and PQR documents have been uploaded.",
      });
      
      // Reset form after successful upload
      setTimeout(() => {
        setWpsFile(null);
        setPqrFile(null);
        setUploadProgress(0);
        setIsUploading(false);
        setUploadStatus('idle');
      }, 1500);
      
    } catch (error) {
      console.error("Error uploading documents:", error);
      setUploadStatus('error');
      setIsUploading(false);
      
      toast({
        title: "Upload Failed",
        description: "There was an error uploading your documents. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WPS and PQR</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage Welding Procedure Specifications (WPS) and Procedure Qualification Records (PQR).
          </p>
        </div>
        
        <Tabs defaultValue="wps" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-[600px] grid-cols-3">
            <TabsTrigger value="wps">WPS</TabsTrigger>
            <TabsTrigger value="pqr">PQR</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          
          {/* Documents Tab Content (Add this new tab) */}
          <TabsContent value="documents" className="mt-6">
            <Card className="max-w-4xl">
              <CardHeader>
                <CardTitle>Document Management</CardTitle>
                <CardDescription>
                  Upload and manage WPS and PQR documents. Files will be stored securely and linked to their respective records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  <div className="border rounded-lg p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">Document Information</h3>
                        <p className="text-sm text-muted-foreground">
                          These documents will be linked using the following IDs
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="wps-id">WPS ID</Label>
                        <Input
                          id="wps-id"
                          value={wpsId}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                      <div>
                        <Label htmlFor="pqr-id">PQR ID</Label>
                        <Input
                          id="pqr-id"
                          value={pqrId}
                          readOnly
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Link Pattern</p>
                      <p className="text-sm text-muted-foreground">
                        These documents follow the one-to-one relationship pattern: <strong>{wpsId}</strong> LINKED TO <strong>{pqrId}</strong>
                      </p>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-medium">Upload Documents</h3>
                      <p className="text-sm text-muted-foreground">
                        Select and upload WPS and PQR document files (PDF format recommended)
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* WPS Document Upload */}
                      <div className="space-y-4">
                        <Label htmlFor="wps-file">WPS Document ({wpsId})</Label>
                        <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center">
                          <div className="mb-4">
                            <FileText className="h-10 w-10 text-muted-foreground" />
                          </div>
                          
                          {wpsFile ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">{wpsFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(wpsFile.size / 1024).toFixed(1)} KB
                              </p>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => setWpsFile(null)}
                              >
                                <X className="mr-2 h-4 w-4" /> Remove
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                                <p className="text-xs text-muted-foreground">PDF, DOC up to 10MB</p>
                              </div>
                              <Input 
                                id="wps-file" 
                                type="file" 
                                className="hidden"
                                accept=".pdf,.doc,.docx" 
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setWpsFile(e.target.files[0]);
                                  }
                                }}
                              />
                              <Label 
                                htmlFor="wps-file"
                                className="mt-4 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer"
                              >
                                <Upload className="mr-2 h-4 w-4" /> Select WPS File
                              </Label>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* PQR Document Upload */}
                      <div className="space-y-4">
                        <Label htmlFor="pqr-file">PQR Document ({pqrId})</Label>
                        <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center">
                          <div className="mb-4">
                            <FileText className="h-10 w-10 text-muted-foreground" />
                          </div>
                          
                          {pqrFile ? (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">{pqrFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(pqrFile.size / 1024).toFixed(1)} KB
                              </p>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => setPqrFile(null)}
                              >
                                <X className="mr-2 h-4 w-4" /> Remove
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                                <p className="text-xs text-muted-foreground">PDF, DOC up to 10MB</p>
                              </div>
                              <Input 
                                id="pqr-file" 
                                type="file" 
                                className="hidden"
                                accept=".pdf,.doc,.docx" 
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setPqrFile(e.target.files[0]);
                                  }
                                }}
                              />
                              <Label 
                                htmlFor="pqr-file"
                                className="mt-4 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer"
                              >
                                <Upload className="mr-2 h-4 w-4" /> Select PQR File
                              </Label>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Upload Progress and Button */}
                    <div className="space-y-4">
                      {isUploading && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Upload Progress</Label>
                            <span className="text-sm">{uploadProgress}%</span>
                          </div>
                          <Progress value={uploadProgress} />
                        </div>
                      )}
                      
                      {uploadStatus === 'success' && (
                        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-md flex items-center">
                          <CheckCircle className="h-5 w-5 mr-2" />
                          <span>Documents uploaded successfully!</span>
                        </div>
                      )}
                      
                      {uploadStatus === 'error' && (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md flex items-center">
                          <AlertCircle className="h-5 w-5 mr-2" />
                          <span>Error uploading documents. Please try again.</span>
                        </div>
                      )}
                      
                      <Button 
                        onClick={handleDocumentUpload}
                        disabled={isUploading || (!wpsFile && !pqrFile)}
                        className="w-full"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Documents
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Document Management Section */}
                  <div className="border rounded-lg p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-medium">Document Library</h3>
                      <p className="text-sm text-muted-foreground">
                        View and manage your WPS and PQR documents
                      </p>
                    </div>
                    
                    {/* This would typically be populated from an API call */}
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground text-center py-10">
                        No documents have been uploaded yet.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* WPS Form Tab */}
          <TabsContent value="wps" className="mt-6">
            <Card className="max-w-4xl">
              <CardHeader>
                <CardTitle>Welding Procedure Specification (WPS)</CardTitle>
                <CardDescription>
                  Create a new Welding Procedure Specification to document welding variables.
                  When you create a WPS, a matching PQR with the same ID number will automatically be created.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <Form {...wpsForm}>
                    <form onSubmit={wpsForm.handleSubmit(onWpsSubmit)} className="space-y-6">
                      {/* WPS ID Field */}
                      <FormField
                        control={wpsForm.control}
                        name="wpsId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WPS ID</FormLabel>
                            <FormControl>
                              <Input {...field} readOnly />
                            </FormControl>
                            <FormDescription>
                              Auto-generated WPS identifier
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Material Type and Grade */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={wpsForm.control}
                          name="materialType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Material Type</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Material Type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Carbon Steel">Carbon Steel</SelectItem>
                                  <SelectItem value="Stainless Steel">Stainless Steel</SelectItem>
                                  <SelectItem value="Low Alloy Steel">Low Alloy Steel</SelectItem>
                                  <SelectItem value="Aluminum">Aluminum</SelectItem>
                                  <SelectItem value="Copper Alloy">Copper Alloy</SelectItem>
                                  <SelectItem value="Nickel Alloy">Nickel Alloy</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={wpsForm.control}
                          name="materialGrade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Material Grade</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Material Grade" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="A36">A36</SelectItem>
                                  <SelectItem value="A516 Gr 70">A516 Gr 70</SelectItem>
                                  <SelectItem value="A106 Gr B">A106 Gr B</SelectItem>
                                  <SelectItem value="304/304L">304/304L</SelectItem>
                                  <SelectItem value="316/316L">316/316L</SelectItem>
                                  <SelectItem value="F22">F22</SelectItem>
                                  <SelectItem value="F91">F91</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Welding Process and Position */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={wpsForm.control}
                          name="weldingProcess"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Welding Process</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Welding Process" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="SMAW">SMAW (Shielded Metal Arc Welding)</SelectItem>
                                  <SelectItem value="GTAW">GTAW (Gas Tungsten Arc Welding)</SelectItem>
                                  <SelectItem value="GMAW">GMAW (Gas Metal Arc Welding)</SelectItem>
                                  <SelectItem value="FCAW">FCAW (Flux Cored Arc Welding)</SelectItem>
                                  <SelectItem value="SAW">SAW (Submerged Arc Welding)</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={wpsForm.control}
                          name="weldingPosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Welding Position</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Welding Position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Flat">Flat (1G/1F)</SelectItem>
                                  <SelectItem value="Horizontal">Horizontal (2G/2F)</SelectItem>
                                  <SelectItem value="Vertical">Vertical (3G/3F)</SelectItem>
                                  <SelectItem value="Overhead">Overhead (4G/4F)</SelectItem>
                                  <SelectItem value="Multiple">Multiple Positions</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Filler Material and Shielding Gas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={wpsForm.control}
                          name="fillerMaterial"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Filler Material</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., E7018, ER70S-6" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={wpsForm.control}
                          name="shieldingGas"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shielding Gas (if applicable)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., Argon, 75% Ar/25% CO2" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Temperature Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={wpsForm.control}
                          name="preheatTemperature"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Preheat Temperature</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., 200°F, 100°C" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={wpsForm.control}
                          name="interpassTemperature"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Interpass Temperature</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., 350°F, 175°C" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* PWHT Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={wpsForm.control}
                          name="pwht"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Post Weld Heat Treatment (PWHT)</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="PWHT Required?" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Yes">Yes</SelectItem>
                                  <SelectItem value="No">No</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {showPwhtDetails && (
                          <FormField
                            control={wpsForm.control}
                            name="pwhtDetails"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>PWHT Details</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Temperature, duration, etc." />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                      
                      {/* Inspection Requirements */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Inspection Requirements</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={wpsForm.control}
                            name="visualInspection"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Visual Inspection Required</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={wpsForm.control}
                            name="mechanicalTest"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Mechanical Test Required</FormLabel>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      
                      {/* Remarks */}
                      <FormField
                        control={wpsForm.control}
                        name="remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remarks</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Enter any additional notes or remarks"
                                className="min-h-[100px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => wpsForm.reset(wpsDefaultValues)}
                        >
                          Reset
                        </Button>
                        <Button type="submit">Create WPS</Button>
                      </div>
                    </form>
                  </Form>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* PQR Form Tab */}
          <TabsContent value="pqr" className="mt-6">
            <Card className="max-w-4xl">
              <CardHeader>
                <CardTitle>Procedure Qualification Record (PQR)</CardTitle>
                <CardDescription>
                  Create a new Procedure Qualification Record to document test results and qualification details.
                  Each PQR is automatically linked to its corresponding WPS with matching ID numbers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <Form {...pqrForm}>
                    <form onSubmit={pqrForm.handleSubmit(onPqrSubmit)} className="space-y-6">
                      {/* PQR ID and Related WPS */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={pqrForm.control}
                          name="pqrId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PQR ID</FormLabel>
                              <FormControl>
                                <Input {...field} readOnly />
                              </FormControl>
                              <FormDescription>
                                Auto-generated PQR identifier (matches WPS number)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={pqrForm.control}
                          name="relatedWpsId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Related WPS ID</FormLabel>
                              <FormControl>
                                <Input {...field} readOnly />
                              </FormControl>
                              <FormDescription>
                                Automatically linked to corresponding WPS
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Test Specimen Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={pqrForm.control}
                          name="testSpecimenMaterial"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Test Specimen Material</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., A516 Gr. 70" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={pqrForm.control}
                          name="testSpecimenThickness"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Test Specimen Thickness</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., 10mm, 0.375 inch" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* Welding Parameters */}
                      <div>
                        <h3 className="text-lg font-medium mb-3">Welding Parameters</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={pqrForm.control}
                            name="voltage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Voltage</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="E.g., 22-24V" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={pqrForm.control}
                            name="amperage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Amperage</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="E.g., 90-110A" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={pqrForm.control}
                            name="travelSpeed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Travel Speed</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="E.g., 150-200 mm/min" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={pqrForm.control}
                            name="wireFeedSpeed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Wire Feed Speed</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="E.g., 200-250 ipm" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      
                      {/* Welding Position, Filler Material, and Shielding Gas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={pqrForm.control}
                          name="weldingPosition"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Welding Position</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Welding Position" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Flat">Flat (1G/1F)</SelectItem>
                                  <SelectItem value="Horizontal">Horizontal (2G/2F)</SelectItem>
                                  <SelectItem value="Vertical">Vertical (3G/3F)</SelectItem>
                                  <SelectItem value="Overhead">Overhead (4G/4F)</SelectItem>
                                  <SelectItem value="Multiple">Multiple Positions</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={pqrForm.control}
                          name="fillerMaterial"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Filler Material</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., E7018, ER70S-6" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={pqrForm.control}
                          name="shieldingGas"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shielding Gas</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., Argon, 75% Ar/25% CO2" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={pqrForm.control}
                          name="preheatTemperature"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Preheat Temperature</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="E.g., 200°F, 100°C" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      {/* PWHT */}
                      <FormField
                        control={pqrForm.control}
                        name="pwht"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Weld Heat Treatment (PWHT)</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="PWHT Applied?" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Yes">Yes</SelectItem>
                                <SelectItem value="No">No</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {/* Test Results */}
                      <div>
                        <h3 className="text-lg font-medium mb-3">Test Results</h3>
                        <div className="grid grid-cols-1 gap-4">
                          <FormField
                            control={pqrForm.control}
                            name="mechanicalTestResults"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Mechanical Test Results</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    placeholder="Enter tensile, bend, impact test results"
                                    className="min-h-[100px]"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={pqrForm.control}
                            name="visualInspectionResult"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Visual Inspection Result</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select Result" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Pass">Pass</SelectItem>
                                    <SelectItem value="Fail">Fail</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={pqrForm.control}
                            name="ndtRequirements"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>NDT Requirements and Results</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    placeholder="Enter NDT methods used and their results"
                                    className="min-h-[100px]"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      
                      {/* Remarks */}
                      <FormField
                        control={pqrForm.control}
                        name="remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remarks</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Enter any additional notes or remarks"
                                className="min-h-[100px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => pqrForm.reset(pqrDefaultValues)}
                        >
                          Reset
                        </Button>
                        <Button type="submit">Create PQR</Button>
                      </div>
                    </form>
                  </Form>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}