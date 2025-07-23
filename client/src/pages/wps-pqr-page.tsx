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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
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
    queryKey: ['/api/quality/wps-pqr/wps'],
    // The API does not exist yet, so we'll disable it to prevent errors
    enabled: false,
  });
  
  // Fetch specific WPS data if ID is provided
  const { data: specificWps, isLoading: isLoadingSpecificWps } = useQuery({
    queryKey: ['/api/quality/wps-pqr/wps', documentId],
    enabled: !!params?.id && false, // Disabled for now
  });
  
  // Fetch specific PQR data if ID is provided
  const { data: specificPqr, isLoading: isLoadingSpecificPqr } = useQuery({
    queryKey: ['/api/quality/wps-pqr/wps/pqr', documentId],
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
      // Sanitize all string inputs to ensure valid JSON
      const sanitizeString = (str: string | undefined): string => {
        if (!str) return "";
        // Remove special characters and replace quotes with simple ones
        return str.replace(/[^\w\s.,\-]/g, '').trim();
      };
      
      // Create data object that exactly matches the server-side field names from the WPS post route
      const wpsData = {
        // Use the provided WPS ID directly (server will handle numbering if needed)
        wpsId: data.wpsId,
        // These field names must exactly match the server-side API expectations
        welderProcess: sanitizeString(data.weldingProcess),
        baseMetalGrade: sanitizeString(data.materialGrade),
        baseMetalThickness: sanitizeString(data.preheatTemperature.replace('°C', '')), 
        fillerMaterial: sanitizeString(data.fillerMaterial),
        jointType: "Butt", // Default value
        weldPosition: sanitizeString(data.weldingPosition),
        preheatingTemp: sanitizeString(data.preheatTemperature.replace('°C', '')),
        postWeldHeatTreatment: data.pwht === 'Yes' ? sanitizeString(data.pwhtDetails) : 'None',
        shieldingGas: sanitizeString(data.shieldingGas || ""),
        status: "Draft",
        remarks: sanitizeString(data.remarks || "")
      };
      
      console.log("Sanitized WPS data for API:", wpsData);
      
      // Send data to the API using apiRequest function
      try {
        console.log("Sending WPS data using apiRequest");
        // Fix the endpoint URL to match server-side routing - note the correct path is /wps-pqr/wps
        const savedWps = await apiRequest('POST', '/api/quality/wps-pqr/wps', wpsData);
        console.log("API response:", savedWps);
      } catch (apiError) {
        console.error("API request failed with error:", apiError);
        throw apiError;
      }
      
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
      pqrForm.setValue("preheatTemperature", data.preheatTemperature.replace(/[°]/g, '')); // Remove degree symbols
      pqrForm.setValue("pwht", data.pwht);
      
      // Update the URL to include the document ID
      if (!params?.id) {
        setLocation(`/wps-pqr/${documentId}`, { replace: true });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({queryKey: ['/api/quality/wps-pqr/wps']});
    } catch (error) {
      console.error("Error saving WPS:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create WPS. Please try again.",
        variant: "destructive",
      });
    }
  };

  // PQR form submission handler
  const onPqrSubmit = async (data: PqrFormValues) => {
    console.log("PQR Form submitted:", data);
    
    try {
      // Sanitize all string inputs to ensure valid JSON
      const sanitizeString = (str: string | undefined): string => {
        if (!str) return "";
        // Remove special characters and replace quotes with simple ones
        return str.replace(/[^\w\s.,\-]/g, '').trim();
      };
      
      // Create data object that exactly matches the server-side field names for PQR
      const pqrData = {
        // WPS ID is expected as a numeric value
        wpsId: sanitizeString(data.relatedWpsId.replace('WPS-', '')),
        // These field names must exactly match the server-side API expectations
        testDate: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
        testLaboratory: "Internal Testing Lab",
        testType: "Mechanical Testing",
        testResults: sanitizeString(data.mechanicalTestResults),
        status: "Draft",
        remarks: sanitizeString(data.remarks || ""),
        // Technical details - these would be added to additional fields on the server
        testSpecimenMaterial: sanitizeString(data.testSpecimenMaterial),
        testSpecimenThickness: sanitizeString(data.testSpecimenThickness.replace('°C', '')),
        voltage: sanitizeString(data.voltage),
        amperage: sanitizeString(data.amperage),
        travelSpeed: sanitizeString(data.travelSpeed),
        wireFeedSpeed: sanitizeString(data.wireFeedSpeed)
      };
      
      console.log("Sanitized PQR data for API:", pqrData);
      
      // Send data to the API using apiRequest
      try {
        console.log("Sending PQR data using apiRequest");
        // Fix the endpoint URL to match server-side routing - note the correct path is /wps-pqr/wps/pqr
        const savedPqr = await apiRequest('POST', '/api/quality/wps-pqr/wps/pqr', pqrData);
        console.log("API response for PQR:", savedPqr);
      } catch (apiError) {
        console.error("API request failed with error:", apiError);
        throw apiError;
      }
      
      toast({
        title: "PQR Created Successfully",
        description: `PQR ID: ${data.pqrId} has been created and linked to ${data.relatedWpsId}.`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({queryKey: ['/api/quality/wps-pqr/wps/pqr']});
      
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
        description: error instanceof Error ? error.message : "Failed to create PQR. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update PWHT Details field visibility based on PWHT selection
  const showPwhtDetails = wpsForm.watch("pwht") === "Yes";
  
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight pl-4">WPS and PQR</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage Welding Procedure Specifications (WPS) and Procedure Qualification Records (PQR).
          </p>
        </div>
        
        <Tabs defaultValue="wps" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="wps">WPS</TabsTrigger>
            <TabsTrigger value="pqr">PQR</TabsTrigger>
          </TabsList>
          
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
                                <Input {...field} placeholder="E.g., 200F, 100C" />
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
                                <Input {...field} placeholder="E.g., 350F, 175C" />
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
                                <Input {...field} placeholder="E.g., 200F, 100C" />
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