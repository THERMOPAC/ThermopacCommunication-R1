import { useState } from "react";
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
import { useQuery } from "@tanstack/react-query";

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
  
  // Fetch existing WPS data for PQR dropdown
  const { data: wpsData } = useQuery({
    queryKey: ['/api/quality/wps'],
    // The API does not exist yet, so we'll disable it to prevent errors
    enabled: false,
  });
  
  // Default values for WPS form
  const wpsDefaultValues: Partial<WpsFormValues> = {
    wpsId: "WPS-" + String(Math.floor(1000 + Math.random() * 9000)), // Generate a random 4-digit number
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
    pqrId: "PQR-" + String(Math.floor(1000 + Math.random() * 9000)), // Generate a random 4-digit number
    relatedWpsId: "",
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

  // WPS form submission handler
  const onWpsSubmit = (data: WpsFormValues) => {
    console.log("WPS Form submitted:", data);
    
    // TODO: Add API call to save the data
    // Currently showing success toast for demonstration
    toast({
      title: "WPS Created Successfully",
      description: `WPS ID: ${data.wpsId} has been created.`,
    });
    
    // Reset form
    wpsForm.reset(wpsDefaultValues);
  };

  // PQR form submission handler
  const onPqrSubmit = (data: PqrFormValues) => {
    console.log("PQR Form submitted:", data);
    
    // TODO: Add API call to save the data
    // Currently showing success toast for demonstration
    toast({
      title: "PQR Created Successfully",
      description: `PQR ID: ${data.pqrId} has been created.`,
    });
    
    // Reset form
    pqrForm.reset(pqrDefaultValues);
  };

  // Update PWHT Details field visibility based on PWHT selection
  const showPwhtDetails = wpsForm.watch("pwht") === "Yes";
  
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
                                Auto-generated PQR identifier
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
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Related WPS" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {/* This would be populated from API data - using placeholders for now */}
                                  <SelectItem value="WPS-1001">WPS-1001</SelectItem>
                                  <SelectItem value="WPS-1002">WPS-1002</SelectItem>
                                  <SelectItem value="WPS-1003">WPS-1003</SelectItem>
                                </SelectContent>
                              </Select>
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